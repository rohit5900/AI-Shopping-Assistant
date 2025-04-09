document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatContainer = document.getElementById('chatContainer');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const chatForm = document.getElementById('chatForm');
    const charCount = document.getElementById('charCount');
    const errorMessage = document.getElementById('errorMessage');
    const themeToggle = document.getElementById('themeToggle');
    
    // Constants
    const MAX_CHARS = 500;
    
    // Show initial greeting with a staggered animation
    setTimeout(() => {
        addMessage("Hello! I'm your shopping assistant. Ask me about products, prices, or shopping advice!");
    }, 500);
    
    // Theme handling
    function initTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.classList.add('dark-mode');
            themeToggle.setAttribute('aria-pressed', 'true');
        }
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                if (e.matches) {
                    document.documentElement.classList.add('dark-mode');
                    themeToggle.setAttribute('aria-pressed', 'true');
                } else {
                    document.documentElement.classList.remove('dark-mode');
                    themeToggle.setAttribute('aria-pressed', 'false');
                }
            }
        });
    }
    
    // Toggle theme with animation
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark-mode');
        themeToggle.setAttribute('aria-pressed', isDark.toString());
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        // Add a subtle animation to the theme toggle
        themeToggle.style.transform = 'scale(1.2)';
        setTimeout(() => {
            themeToggle.style.transform = 'scale(1)';
        }, 200);
    });
    
    // Character counting with visual feedback
    function updateCharCount() {
        const count = userInput.value.length;
        charCount.textContent = count;
        
        // Enable/disable send button based on input
        sendButton.disabled = count === 0 || count > MAX_CHARS;
        
        // Visual feedback for approaching limit
        if (count > MAX_CHARS * 0.9) {
            charCount.classList.add('warning');
        } else {
            charCount.classList.remove('warning');
        }
        
        // Add subtle animation to the input when typing
        if (count > 0) {
            userInput.classList.add('typing');
            document.body.classList.add('typing');
        } else {
            userInput.classList.remove('typing');
            document.body.classList.remove('typing');
        }
    }
    
    // Message handling with enhanced animations
    function addMessage(text, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'} fade-in`;
        
        // Format line breaks, lists, and links
        const formattedText = text
            .replace(/\n/g, '<br>')
            .replace(/- /g, '• ')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = isUser ? text : `<strong>AI:</strong> ${formattedText}`;
        
        messageDiv.appendChild(messageContent);
        chatContainer.appendChild(messageDiv);
        
        // Add a subtle animation to the message
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = isUser ? 'translateX(20px)' : 'translateX(-20px)';
        
        // Trigger reflow
        void messageDiv.offsetWidth;
        
        // Apply the animation
        messageDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateX(0)';
        
        // Smooth scroll to bottom with a slight delay for the animation
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 100);
        
        // Add a subtle highlight effect to new messages
        messageDiv.classList.add('highlight');
        setTimeout(() => {
            messageDiv.classList.remove('highlight');
        }, 1000);
    }
    
    // Error handling with enhanced animation
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.hidden = false;
        
        // Add a shake animation
        errorMessage.classList.add('shake');
        setTimeout(() => {
            errorMessage.classList.remove('shake');
        }, 500);
        
        // Auto-hide after 5 seconds with fade-out
        setTimeout(() => {
            errorMessage.style.opacity = '0';
            setTimeout(() => {
                errorMessage.hidden = true;
                errorMessage.style.opacity = '1';
            }, 300);
        }, 5000);
    }
    
    // API call with enhanced user experience
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;
        
        // Clear input and update UI
        userInput.value = '';
        updateCharCount();
        
        // Add user message with animation
        addMessage(message, true);
        
        try {
            // Add a subtle animation to the send button
            sendButton.classList.add('sending');
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: message })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get response');
            }
            
            if (!data.response) {
                throw new Error('No recommendations found');
            }
            
            // Add AI response
            addMessage(data.response);
            
            // Remove the sending animation
            sendButton.classList.remove('sending');
            
        } catch (error) {
            console.error('API Error:', error);
            showError(`Error: ${error.message}. Please try again.`);
            
            // Remove the sending animation
            sendButton.classList.remove('sending');
        }
    }
    
    // Event listeners with enhanced interactions
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });
    
    userInput.addEventListener('input', updateCharCount);
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Add focus animation to the input
    userInput.addEventListener('focus', () => {
        userInput.classList.add('focused');
    });
    
    userInput.addEventListener('blur', () => {
        userInput.classList.remove('focused');
        // Resume background animation if input is empty
        if (userInput.value.length === 0) {
            document.body.classList.remove('typing');
        }
    });
    
    // Add a subtle hover effect to the send button
    sendButton.addEventListener('mouseenter', () => {
        if (!sendButton.disabled) {
            sendButton.classList.add('hover');
        }
    });
    
    sendButton.addEventListener('mouseleave', () => {
        sendButton.classList.remove('hover');
    });
    
    // Initialize
    initTheme();
    updateCharCount();
    
    // Add a subtle animation to the page load
    document.body.classList.add('loaded');
});
