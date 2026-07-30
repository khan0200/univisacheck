/**
 * SalomKorea AI Admission Assistant - Frontend Widget
 * Floats in the bottom-right corner and connects to the /api/ai-assistant backend.
 */
(function() {
    // 1. Create and inject style sheet reference
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'ai-assistant.css';
    document.head.appendChild(link);

    // 2. DOM Elements Construction
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'aiChatWidgetContainer';
    widgetContainer.innerHTML = `
        <!-- Floating Button -->
        <button class="ai-assistant-btn" id="aiChatBtn" aria-label="Suhbatni boshlash">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        </button>

        <!-- Chat Widget -->
        <div class="ai-chat-widget" id="aiChatWidget">
            <div class="ai-chat-header">
                <div class="ai-chat-profile">
                    <div class="ai-chat-avatar">🎓</div>
                    <div class="ai-chat-info-text">
                        <span class="ai-chat-name">SalomKorea AI</span>
                        <span class="ai-chat-status">Maslahatchi · Online</span>
                    </div>
                </div>
                <button class="ai-chat-close" id="aiChatClose" aria-label="Yopish">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <!-- Messages Window -->
            <div class="ai-chat-messages" id="aiChatMessages">
                <div class="ai-message assistant">
                    <div class="ai-message-content">
                        Salom! Men Janubiy Koreya bo'yicha SalomKorea AI maslahatchisiman. 🇰🇷<br><br>
                        Koreyada o'qish, universitet tanlash, viza olish tartibi (D-2/D-4), grantlar va zarur hujjatlar bo'yicha savollaringizga javob bera olaman.
                    </div>
                </div>
            </div>

            <!-- Suggestions -->
            <div class="ai-chat-suggestions" id="aiChatSuggestions">
                <div class="ai-suggestion-chip" data-query="Viza imkoniyat kalkulyatori boshlash">🧮 Viza Kalkulyator</div>
                <div class="ai-suggestion-chip" data-query="Qaysi universitetlar 1% yengillashtirilgan?">🥇 1% Universitetlar</div>
                <div class="ai-suggestion-chip" data-query="IELTS 5.5 bilan qanday grantlar bor?">📊 IELTS 5.5 Grantlar</div>
                <div class="ai-suggestion-chip" data-query="Viza olish uchun qanday hujjatlar kerak?">🛂 Viza Hujjatlari</div>
                <div class="ai-suggestion-chip" data-query="Bankshot va KDB bank ma'lumotnomasi nima?">💰 Bankshot nima?</div>
            </div>

            <!-- Input Form -->
            <div class="ai-chat-input-area">
                <input type="text" class="ai-chat-input" id="aiChatInput" placeholder="Savolingizni yozing..." maxlength="1000">
                <button class="ai-chat-send" id="aiChatSend" disabled>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
            <!-- Disclaimer -->
            <div class="ai-chat-disclaimer">
                ⚠️ AI xato qilishi mumkin. Ma'lumotlarni ikki marta tekshiring.
            </div>
        </div>
    `;

    document.body.appendChild(widgetContainer);

    // 3. Elements References
    const chatBtn = document.getElementById('aiChatBtn');
    const chatWidget = document.getElementById('aiChatWidget');
    const chatClose = document.getElementById('aiChatClose');
    const chatMessages = document.getElementById('aiChatMessages');
    const chatInput = document.getElementById('aiChatInput');
    const chatSend = document.getElementById('aiChatSend');
    const chatSuggestions = document.getElementById('aiChatSuggestions');

    // Chat history state
    let history = [];
    let isWaiting = false;

    // 4. Formatting helper: Simple Markdown parser (supports tables, lists, bold)
    function formatMarkdown(text) {
        if (!text) return '';
        let html = text;

        // Escape HTML tags to prevent XSS
        html = html
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Bold: **text**
        html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');

        // Lists
        html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
        html = html.replace(/<\/ul>\s*<ul>/g, ''); // Join lists

        // Tables
        const lines = html.split('\n');
        let inTable = false;
        let tableHtml = '';
        const outputLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|') && line.endsWith('|')) {
                if (line.includes('---')) continue; // Skip separator line
                const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                if (!inTable) {
                    inTable = true;
                    tableHtml = '<table><thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
                } else {
                    tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
                }
            } else {
                if (inTable) {
                    inTable = false;
                    tableHtml += '</tbody></table>';
                    outputLines.push(tableHtml);
                    tableHtml = '';
                }
                outputLines.push(lines[i]);
            }
        }
        if (inTable) {
            tableHtml += '</tbody></table>';
            outputLines.push(tableHtml);
        }
        html = outputLines.join('\n');

        // Line breaks and paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        html = '<p>' + html + '</p>';
        html = html.replace(/<p><\/p>/g, ''); // Clean empty paragraphs

        return html;
    }

    // Toggle Chat Widget
    chatBtn.addEventListener('click', () => {
        chatWidget.classList.toggle('open');
        if (chatWidget.classList.contains('open')) {
            chatInput.focus();
        }
    });

    chatClose.addEventListener('click', () => {
        chatWidget.classList.remove('open');
    });

    // Handle Input Changes (enable/disable send button)
    chatInput.addEventListener('input', () => {
        chatSend.disabled = chatInput.value.trim().length === 0;
    });

    // Send Message on Enter
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !chatSend.disabled && !isWaiting) {
            sendMessage();
        }
    });

    // Send Message on Click
    chatSend.addEventListener('click', () => {
        if (!chatSend.disabled && !isWaiting) {
            sendMessage();
        }
    });

    // Handle Suggestions
    chatSuggestions.addEventListener('click', (e) => {
        const chip = e.target.closest('.ai-suggestion-chip');
        if (chip && !isWaiting) {
            const query = chip.dataset.query;
            chatInput.value = query;
            chatSend.disabled = false;
            sendMessage();
        }
    });

    // Message Renderer
    function addMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-message ${role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'ai-message-content';
        
        if (role === 'assistant') {
            contentDiv.innerHTML = formatMarkdown(content);
        } else {
            contentDiv.textContent = content;
        }

        msgDiv.appendChild(contentDiv);
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Save to state history
        history.push({ role, content });
    }

    // Add Typing Indicator
    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'ai-message assistant typing-indicator-container';
        indicator.innerHTML = `
            <div class="ai-message-content" style="padding: 10px 14px;">
                <div class="ai-typing-indicator">
                    <div class="ai-typing-dot"></div>
                    <div class="ai-typing-dot"></div>
                    <div class="ai-typing-dot"></div>
                </div>
            </div>
        `;
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return indicator;
    }

    // Main API Call & Send Action
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';
        chatSend.disabled = true;
        isWaiting = true;

        // Hide suggestions after the first message
        chatSuggestions.style.display = 'none';

        // Add user message
        addMessage('user', text);

        // Show typing indicator
        const indicator = showTypingIndicator();

        try {
            // Determine backend URL based on host
            let apiUrl = '/api/ai-assistant';
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                apiUrl = 'http://localhost:3000/api/ai-assistant';
            }

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: text,
                    history: history.slice(0, -1) // Send history excluding the last message we just added
                })
            });

            if (!res.ok) {
                throw new Error('API server returned error');
            }

            const data = await res.json();
            
            // Remove typing indicator
            indicator.remove();

            if (data.error) {
                addMessage('assistant', `❌ Xatolik yuz berdi: ${data.error}`);
            } else if (data.response) {
                addMessage('assistant', data.response);
            } else {
                addMessage('assistant', 'Siz yuborgan so\'rov bo\'yicha javob olinmadi.');
            }

        } catch (err) {
            console.error('[AI Assistant]:', err);
            indicator.remove();
            addMessage('assistant', '❌ Kechirasiz, tarmoq xatoligi sababli javob olish imkoni bo\'lmadi. Local proxy server ishlayotganligini tekshiring.');
        } finally {
            isWaiting = false;
        }
    }
})();
