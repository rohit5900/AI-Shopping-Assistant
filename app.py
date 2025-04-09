from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
import google.generativeai as genai
import os
import logging
import time
import json
from datetime import datetime
from dotenv import load_dotenv
from functools import wraps

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("app.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", os.urandom(24))
CORS(app)

# Configure rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["30 per minute", "100 per hour"]
)

# Configure caching
cache = Cache(app, config={
    'CACHE_TYPE': 'simple',
    'CACHE_DEFAULT_TIMEOUT': 300
})

# Configure Gemini with your API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY not found in environment variables")
    raise ValueError("GEMINI_API_KEY is required")

genai.configure(api_key=GEMINI_API_KEY)

# Initialize the model with the latest version
try:
    model = genai.GenerativeModel('gemini-1.5-flash')
    logger.info("Successfully initialized Gemini model")
except Exception as e:
    logger.error(f"Failed to initialize Gemini model: {str(e)}")
    raise

# Enhanced shopping prompt template with strict requirements
SHOPPING_PROMPT = """You are a professional shopping assistant. For any product query:

REQUIRED RESPONSE FORMAT:
1. Product Category: [category name]
2. Top 3 Recommendations:
   - [Brand] [Model] | Price: [$X-$Y] | Features: [3 key features] | Buy at: [store1, store2]
   - [Brand] [Model] | Price: [$X-$Y] | Features: [3 key features] | Buy at: [store1, store2]
   - [Brand] [Model] | Price: [$X-$Y] | Features: [3 key features] | Buy at: [store1, store2]
3. Shopping Tips: [brief advice]

EXAMPLE RESPONSE FOR "ORGANIC COTTON SHEETS":
1. Product Category: Bed Sheets
2. Top 3 Recommendations:
   - Boll & Branch Signature Hemmed | Price: $229-$279 | Features: 100% organic cotton, 300 thread count, Oeko-Tex certified | Buy at: [bollandbranch.com, Amazon]
   - Brooklinen Luxe Core Sheet Set | Price: $199-$249 | Features: Long-staple organic cotton, 480 thread count, 30-day trial | Buy at: [brooklinen.com]
   - Target Threshold Organic Cotton | Price: $49-$79 | Features: Affordable organic option, 200 thread count, multiple colors | Buy at: [Target stores, target.com]
3. Shopping Tips: Look for GOTS certification for true organic cotton.

Now respond to this query: {query}"""

# Error handling decorator
def handle_errors(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error in {f.__name__}: {str(e)}", exc_info=True)
            return jsonify({
                "error": "An unexpected error occurred",
                "details": str(e) if os.getenv("FLASK_ENV") == "development" else None
            }), 500
    return decorated_function

# Track API usage
def track_api_usage():
    if 'api_calls' not in session:
        session['api_calls'] = 0
    session['api_calls'] += 1
    session['last_api_call'] = datetime.now().isoformat()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
@limiter.limit("10 per minute")
@handle_errors
def chat():
    start_time = time.time()
    track_api_usage()
    
    data = request.json
    query = data.get('query', '').strip()
    
    if not query:
        return jsonify({"error": "Please enter a valid question"}), 400
    
    # Check cache first
    cache_key = f"query_{hash(query)}"
    cached_response = cache.get(cache_key)
    if cached_response:
        logger.info(f"Cache hit for query: {query[:30]}...")
        return jsonify({"response": cached_response, "cached": True})
    
    logger.info(f"Processing query: {query[:30]}...")
    
    # Generate response with enhanced configuration
    try:
        response = model.generate_content(
            SHOPPING_PROMPT.format(query=query),
            generation_config={
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 40,
                "max_output_tokens": 1000
            },
            safety_settings={
                'HARM_CATEGORY_HARASSMENT': 'BLOCK_NONE',
                'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_NONE',
                'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE',
                'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_NONE'
            }
        )
        
        # Ensure we get text response
        if not response.text:
            raise ValueError("Empty response from AI model")
        
        # Cache the response
        cache.set(cache_key, response.text, timeout=3600)  # Cache for 1 hour
        
        # Log performance metrics
        elapsed_time = time.time() - start_time
        logger.info(f"Query processed in {elapsed_time:.2f} seconds")
        
        return jsonify({
            "response": response.text,
            "cached": False
        })
        
    except Exception as e:
        logger.error(f"Error generating response: {str(e)}", exc_info=True)
        return jsonify({
            "error": "Failed to get shopping recommendations",
            "details": str(e) if os.getenv("FLASK_ENV") == "development" else None
        }), 500

@app.route('/api/stats', methods=['GET'])
@handle_errors
def get_stats():
    """Return API usage statistics"""
    api_calls = session.get('api_calls', 0)
    last_call = session.get('last_api_call', None)
    
    return jsonify({
        "api_calls": api_calls,
        "last_api_call": last_call
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "model": "gemini-1.5-flash"
    })

# Error handlers
@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({"error": "Rate limit exceeded. Please try again later."}), 429

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {str(e)}", exc_info=True)
    return jsonify({"error": "An internal server error occurred"}), 500

@app.errorhandler(404)
def not_found_error(e):
    return jsonify({"error": "Resource not found"}), 404

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV") == "development"
    
    logger.info(f"Starting application on port {port}, debug={debug}")
    app.run(host='0.0.0.0', port=port, debug=debug)