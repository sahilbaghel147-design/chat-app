// chat-logic.js - Final Unified Code for Client-Side Operations

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. SIDEBAR TOGGLE LOGIC (☰ बटन फिक्स) ---
    const sidebar = document.getElementById('sidebar');
    const sidebarCollapse = document.getElementById('sidebarCollapse');
    const content = document.getElementById('content');

    if (sidebar && sidebarCollapse && content) {
        sidebarCollapse.addEventListener('click', () => {
            // #sidebar और #content पर 'active' क्लास को toggle करें
            sidebar.classList.toggle('active');
            content.classList.toggle('active'); 
        });
    }

    // --- 2. USER/LOGOUT SETUP ---
    const username = localStorage.getItem('username');
    const welcomeMessageEl = document.getElementById('welcomeMessage');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!username) {
        if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('signup.html')) {
             window.location.href = '/login.html'; 
        }
        return;
    }
    
    if (welcomeMessageEl) {
        welcomeMessageEl.textContent = `Welcome, ${username}!`;
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('username');
            window.location.href = '/login.html';
        });
    }
    
    // --- 3. CHAT AND SOCKET.IO LOGIC (केवल chat.html पर) ---
    if (window.location.pathname.includes('chat.html')) {
        
        // Ensure that the Socket.IO library is loaded in chat.html before this script runs
        // (You must include: <script src="/socket.io/socket.io.js"></script> in chat.html)
        const socket = io(); 

        const currentChatRecipientEl = document.getElementById('currentChatRecipient');
        const onlineUsersList = document.getElementById('onlineUsersList');
        const messageInput = document.getElementById('messageInput');
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const messageDisplayArea = document.getElementById('messageDisplayArea');
        const attachFileBtn = document.getElementById('attachFileBtn');
        const fileInput = document.getElementById('fileInput');

        let currentRecipient = null;

        // --- A. Connection & User List ---
        socket.emit("newUser", username);

        socket.on("updateUsers", (users) => {
            onlineUsersList.innerHTML = '';
            users.forEach(user => {
                if (user !== username) {
                    const li = document.createElement('li');
                    li.textContent = user;
                    li.dataset.username = user;
                    li.classList.add('online-user-item');
                    li.addEventListener('click', () => selectRecipient(user, li));
                    onlineUsersList.appendChild(li);
                }
            });
        });

        function selectRecipient(recipient, clickedElement) {
            document.querySelectorAll('.online-user-item').forEach(el => el.classList.remove('active'));
            if(clickedElement) clickedElement.classList.add('active');

            currentRecipient = recipient;
            currentChatRecipientEl.textContent = `Chatting with: ${recipient}`;
            messageDisplayArea.innerHTML = ''; 
            
            socket.emit("loadChat", { user1: username, user2: recipient });
        }

        // --- B. Message Sending & Display ---
        function sendMessage(text, fileUrl = null, mimeType = null, originalName = null) {
            if (!currentRecipient) {
                alert("Please select a user to chat with.");
                return;
            }
            if (!text.trim() && !fileUrl) return;

            const messageData = { 
                sender: username, 
                receiver: currentRecipient, 
                text: text, 
                fileUrl, 
                mimeType, 
                originalName 
            };
            
            socket.emit("privateMessage", messageData);
            messageInput.value = '';
        }

        sendMessageBtn.addEventListener('click', () => sendMessage(messageInput.value));
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage(messageInput.value);
        });

        socket.on("chatHistory", (chats) => {
            messageDisplayArea.innerHTML = '';
            chats.forEach(msg => displayMessage(msg));
            messageDisplayArea.scrollTop = messageDisplayArea.scrollHeight;
        });

        socket.on("privateMessage", (msg) => {
            if (msg.sender === currentRecipient || msg.receiver === currentRecipient) {
                displayMessage(msg);
                messageDisplayArea.scrollTop = messageDisplayArea.scrollHeight;
            }
        });


        // --- C. File Handling Functions ---
        attachFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileUpload);
        
        function handleFileUpload(e) {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('chatFile', file);
            
            fetch('/upload', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const fileNameText = `[File shared: ${data.originalName}]`;
                    sendMessage(fileNameText, data.fileUrl, data.mimeType, data.originalName);
                } else {
                    alert('File upload failed: ' + data.message);
                }
            })
            .catch(error => console.error('Error uploading file:', error));
            
            fileInput.value = ''; 
        }

        function displayMessage(msg) {
            const messageEl = document.createElement('div');
            const isSender = msg.sender === username;
            
            messageEl.classList.add('message');
            messageEl.classList.add(isSender ? 'sender' : 'receiver');
            
            if (msg.fileUrl) {
                 const fileLink = document.createElement('a');
                 fileLink.href = msg.fileUrl;
                 fileLink.target = '_blank';
                 fileLink.textContent = `⬇️ Download: ${msg.originalName || "File"}`;
                 fileLink.style.display = 'block';
                 fileLink.style.color = isSender ? 'white' : 'var(--color-accent)'; 
                 fileLink.style.marginBottom = '5px';
                 messageEl.appendChild(fileLink);
            }
            
            const textContent = document.createElement('p');
            textContent.textContent = msg.text || '';
            messageEl.appendChild(textContent);

            messageDisplayArea.appendChild(messageEl);
        }
    }
});
