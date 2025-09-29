// chat.js - Sistema completo de Chat + Integração WhatsApp PRODUCTION-READY v3.0
(function(){
  // ============================================================================
  // CONFIGURAÇÃO E UTILITÁRIOS
  // ============================================================================
  
  // Pega URL do backend de várias fontes possíveis
  var thisScript = document.currentScript || (function(){ 
    var s = document.getElementsByTagName('script'); 
    return s[s.length-1]; 
  })();
  
  var API_BASE_URL = (thisScript && thisScript.getAttribute('data-api')) 
                     || (new URLSearchParams(window.location.search).get('api')) 
                     || localStorage.getItem('backend_url') 
                     || 'https://law-firm-backend-936902782519-936902782519.us-central1.run.app';

  // SEU NÚMERO COMERCIAL DO WHATSAPP (ALTERE AQUI)
  var COMMERCIAL_WHATSAPP = "5511918368812"; // ⚠️ SUBSTITUA PELO SEU NÚMERO

  // ============================================================================
  // SISTEMA DE CHAT PRODUCTION-READY
  // ============================================================================

  // Estado global do chat
  var chatState = {
    isLoading: false,
    rateLimited: false,
    rateLimitTimer: null,
    currentSessionId: null,
    conversationData: {},
    retryCount: 0,
    lastCorrelationId: null
  };

  // Constantes de configuração
  var CONFIG = {
    REQUEST_TIMEOUT: 10000, // 10 segundos
    RATE_LIMIT_COOLDOWN: 30000, // 30 segundos
    MAX_RETRY_ATTEMPTS: 1,
    TYPING_ANIMATION_DELAY: 2000,
    PROGRESS_UPDATE_INTERVAL: 100
  };

  // Monta a interface do chat com melhorias visuais
  function mountChatUI() {
    var root = document.getElementById('chat-root');
    if(!root){ 
      root = document.createElement('div'); 
      root.id = 'chat-root'; 
      document.body.appendChild(root); 
    }
    
    root.innerHTML = `
      <div class="chat-container" role="dialog" aria-label="Chat">
        <div class="chat-header">
          💬 Chat Advocacia — Escritório m.lima
          <div id="progress-bar" class="progress-bar" style="display: none;">
            <div id="progress-fill" class="progress-fill"></div>
          </div>
        </div>
        <div id="chat-messages" class="messages"></div>
        <div class="input-area">
          <input id="chat-input" placeholder="Digite sua mensagem... ⚖️" aria-label="Mensagem"/>
          <button id="chat-send">Enviar</button>
          <div id="rate-limit-timer" class="rate-limit-timer" style="display: none;"></div>
        </div>
      </div>
    `;
    
    // Event listeners do chat
    document.getElementById('chat-send').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keypress', function(e){ 
      if(e.key==='Enter' && !chatState.isLoading && !chatState.rateLimited) {
        sendChatMessage(); 
      }
    });
    
    // Restaurar sessão se existir
    restoreSession();
    
    // Mensagem inicial
    addChatMessage("Olá! Para começar nosso atendimento, digite uma saudação como 'oi'.", 'bot');
  }

  // Sistema de persistência de sessão
  function saveSession() {
    try {
      var sessionData = {
        sessionId: chatState.currentSessionId,
        conversationData: chatState.conversationData,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('chat_session_data', JSON.stringify(sessionData));
    } catch(e) {
      console.warn('Não foi possível salvar sessão:', e);
    }
  }

  function restoreSession() {
    try {
      var savedData = localStorage.getItem('chat_session_data');
      if (savedData) {
        var sessionData = JSON.parse(savedData);
        // Restaurar apenas se sessão for recente (menos de 1 hora)
        var sessionAge = Date.now() - new Date(sessionData.timestamp).getTime();
        if (sessionAge < 3600000) { // 1 hora
          chatState.currentSessionId = sessionData.sessionId;
          chatState.conversationData = sessionData.conversationData || {};
          console.log('✅ Sessão restaurada:', chatState.currentSessionId);
        }
      }
    } catch(e) {
      console.warn('Não foi possível restaurar sessão:', e);
    }
  }

  // Adiciona mensagem na interface do chat com melhorias visuais
  function addChatMessage(text, sender, messageType = 'normal'){
    var messagesContainer = document.getElementById('chat-messages');
    if(!messagesContainer) return;
    
    var messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (sender === 'user' ? 'user' : 'bot');
    
    // Adicionar classes específicas baseadas no tipo
    if (messageType === 'error') messageDiv.classList.add('error-message');
    if (messageType === 'success') messageDiv.classList.add('success-message');
    if (messageType === 'warning') messageDiv.classList.add('warning-message');

    var avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = sender === 'user' ? '👤' : '🤖';

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    if(sender === 'user'){ 
      messageDiv.appendChild(bubble); 
      messageDiv.appendChild(avatar); 
    } else { 
      messageDiv.appendChild(avatar); 
      messageDiv.appendChild(bubble); 
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Salvar na sessão
    saveSession();
  }

  // Sistema de loading com animação melhorada
  function showBotTypingAndReply(message, messageType = 'normal', delay = CONFIG.TYPING_ANIMATION_DELAY){
    const messagesContainer = document.getElementById('chat-messages');
    if(!messagesContainer) return;

    // Indicador de digitando melhorado
    const typingDiv = document.createElement('div');
    typingDiv.classList.add('message', 'bot', 'typing-message');
    typingDiv.innerHTML = `
      <div class="avatar">🤖</div>
      <div class="bubble typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Após delay, remove o "digitando" e mostra a resposta
    setTimeout(() => {
      typingDiv.remove();
      addChatMessage(message, 'bot', messageType);
    }, delay);
  }

  // Sistema de barra de progresso
  function updateProgressBar(confidenceScore) {
    var progressBar = document.getElementById('progress-bar');
    var progressFill = document.getElementById('progress-fill');
    
    if (!progressBar || !progressFill) return;
    
    if (confidenceScore > 0) {
      progressBar.style.display = 'block';
      var percentage = Math.min(confidenceScore * 100, 100);
      progressFill.style.width = percentage + '%';
      
      // Esconder após 3 segundos se completo
      if (percentage >= 100) {
        setTimeout(() => {
          progressBar.style.display = 'none';
        }, 3000);
      }
    } else {
      progressBar.style.display = 'none';
    }
  }

  // Sistema de rate limiting
  function handleRateLimit() {
    chatState.rateLimited = true;
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');
    var timerDiv = document.getElementById('rate-limit-timer');
    
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (timerDiv) timerDiv.style.display = 'block';
    
    var remainingTime = CONFIG.RATE_LIMIT_COOLDOWN / 1000; // 30 segundos
    
    var countdown = setInterval(() => {
      if (timerDiv) {
        timerDiv.textContent = `Aguarde ${remainingTime}s para enviar nova mensagem`;
      }
      
      remainingTime--;
      
      if (remainingTime <= 0) {
        clearInterval(countdown);
        chatState.rateLimited = false;
        
        if (input) input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (timerDiv) {
          timerDiv.style.display = 'none';
          timerDiv.textContent = '';
        }
      }
    }, 1000);
    
    chatState.rateLimitTimer = countdown;
  }

  // Sistema de detecção robusta de fluxo completo
  function isFlowCompleted(responseData) {
    // Múltiplas verificações para robustez
    var flowCompleted = responseData.flow_completed === true;
    var highConfidence = (responseData.confidence_score || 0) >= 0.8;
    var completedState = responseData.state === 'completed';
    var hasExtractedData = responseData.extracted_data && 
                          Object.keys(responseData.extracted_data).length > 0;
    
    // Log para debugging
    console.log('🔍 Verificação de fluxo completo:', {
      flow_completed: flowCompleted,
      confidence_score: responseData.confidence_score,
      high_confidence: highConfidence,
      state: responseData.state,
      completed_state: completedState,
      has_extracted_data: hasExtractedData,
      correlation_id: responseData.correlation_id
    });
    
    // Fluxo é considerado completo se:
    // 1. Backend explicitamente marca como completo OU
    // 2. Alta confiança + estado completo + dados extraídos
    return flowCompleted || (highConfidence && completedState && hasExtractedData);
  }

  // Sistema de extração de dados inteligente
  function extractUserData(responseData) {
    console.log('📊 [EXTRACT_DATA] Extraindo dados do usuário...');
    
    // ✅ GARANTIR que sempre temos um objeto válido
    var extractedData = {};
    var leadData = {};
    
    // Priorizar lead_data, fallback para extracted_data
    if (responseData && typeof responseData === 'object') {
      if (responseData.lead_data && typeof responseData.lead_data === 'object') {
        leadData = responseData.lead_data;
        extractedData = responseData.lead_data;
      } else if (responseData.extracted_data && typeof responseData.extracted_data === 'object') {
        extractedData = responseData.extracted_data;
        leadData = responseData.extracted_data;
      }
    }
    
    console.log('📋 [EXTRACT_DATA] Lead data:', leadData);
    console.log('📋 [EXTRACT_DATA] Extracted data:', extractedData);
    
    // ✅ MAPEAMENTO ROBUSTO com múltiplas fontes
    var userData = {
      name: leadData.identification || leadData.name || leadData.nome || extractedData.name || extractedData.nome || '',
      phone: leadData.contact_info || leadData.phone || leadData.telefone || leadData.whatsapp || 
             extractedData.phone || extractedData.telefone || extractedData.whatsapp || '',
      email: leadData.email || extractedData.email || '',
      legal_area: leadData.area_qualification || leadData.legal_area || leadData.area_juridica || leadData.area ||
                  extractedData.legal_area || extractedData.area_juridica || extractedData.area || '',
      description: leadData.case_details || leadData.description || leadData.descricao || leadData.details || leadData.problema ||
                   extractedData.description || extractedData.descricao || extractedData.details || extractedData.problema || ''
    };
    
    // ✅ LIMPEZA SEGURA de dados vazios
    Object.keys(userData).forEach(key => {
      if (!userData[key] || (typeof userData[key] === 'string' && userData[key].trim() === '')) {
        delete userData[key];
      }
    });
    
    console.log('✅ [EXTRACT_DATA] Dados finais extraídos:', userData);
    console.log('📊 [EXTRACT_DATA] Total de campos:', Object.keys(userData).length);
    
    return userData;
  }

  // Sistema de tratamento de diferentes tipos de resposta
  function handleResponseType(responseData) {
    var responseType = responseData.response_type || 'web_intelligent';
    
    switch(responseType) {
      case 'rate_limited':
        console.log('⚠️ Rate limit detectado');
        handleRateLimit();
        showBotTypingAndReply(
          "Você está enviando muitas mensagens. Aguarde um momento para continuar.",
          'warning'
        );
        break;
        
      case 'error_recovery':
        console.log('🔄 Erro recuperável detectado');
        showBotTypingAndReply(
          responseData.response || "Houve um pequeno problema, mas podemos continuar. Tente reformular sua mensagem.",
          'warning'
        );
        break;
        
      case 'system_error':
        console.log('❌ Erro de sistema detectado');
        showBotTypingAndReply(
          "Ocorreu um erro temporário. Nossa equipe foi notificada. Tente novamente em alguns minutos.",
          'error'
        );
        break;
        
      case 'web_intelligent':
      default:
        console.log('✅ Resposta normal processada');
        var message = responseData.response || responseData.reply || responseData.question || 
                     '🤔 Desculpe, não consegui processar sua mensagem adequadamente.';
        
        // Verificar se fluxo está completo
        if (isFlowCompleted(responseData)) {
          var userData = extractUserData(responseData);
          showCompletionMessage(message, userData);
        } else {
          showBotTypingAndReply(message);
        }
        
        // Atualizar barra de progresso
        if (responseData.confidence_score) {
          updateProgressBar(responseData.confidence_score);
        }
        break;
    }
    
    // Salvar correlation_id para debugging
    if (responseData.correlation_id) {
      chatState.lastCorrelationId = responseData.correlation_id;
    }
  }

  // Sistema de mensagem de conclusão com botão WhatsApp
  function showCompletionMessage(message, userData) {
    showBotTypingAndReply(message + "\n\n✅ Informações coletadas! Clique no botão abaixo para ser direcionado ao WhatsApp.", 'success');
    
    // Adicionar botão WhatsApp após um delay
    setTimeout(() => {
      var messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) return;
      
      var whatsappDiv = document.createElement('div');
      whatsappDiv.className = 'message bot completion-message';
      whatsappDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="bubble completion-bubble">
          <button class="whatsapp-completion-btn" onclick="window.WhatsAppIntegration.openWhatsApp('chat_completion', ${JSON.stringify(userData).replace(/"/g, '&quot;')})">
            📱 Continuar no WhatsApp
          </button>
          <div class="completion-summary">
            <small>Dados coletados: ${Object.keys(userData).length} informações</small>
          </div>
        </div>
      `;
      
      messagesContainer.appendChild(whatsappDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 1000);
  }

  // Sistema de requisição com timeout e retry
  async function makeRequestWithTimeout(url, options, timeout = CONFIG.REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // Sistema de envio de mensagens robusto
  async function sendChatMessage(){
    var input = document.getElementById('chat-input');
    var text = (input.value || '').trim();
    
    if(!text || chatState.isLoading || chatState.rateLimited) return;
    
    // Marcar como loading
    chatState.isLoading = true;
    var sendBtn = document.getElementById('chat-send');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Enviando...';
    }
    
    addChatMessage(text, 'user');
    input.value = '';

    // Gerar ou usar session_id existente
    if (!chatState.currentSessionId) {
      chatState.currentSessionId = 'web_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    var payload = { 
      message: text, 
      session_id: chatState.currentSessionId,
      user_data: chatState.conversationData
    };

    try {
      console.log('📡 Enviando mensagem:', payload);
      
      var response = await makeRequestWithTimeout(API_BASE_URL + '/api/v1/conversation/respond', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if(!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      var data = await response.json();
      console.log('📨 Resposta recebida:', data);
      
      // Atualizar session_id se fornecido
      if(data.session_id) {
        chatState.currentSessionId = data.session_id;
      }
      
      // Salvar dados da conversa
      if (data.extracted_data) {
        chatState.conversationData = { ...chatState.conversationData, ...data.extracted_data };
      }
      
      // Resetar contador de retry
      chatState.retryCount = 0;
      
      // Processar resposta baseada no tipo
      handleResponseType(data);
      
    } catch(error) {
      console.error('❌ Erro na requisição:', error);
      
      // Sistema de retry
      if (chatState.retryCount < CONFIG.MAX_RETRY_ATTEMPTS && 
          (error.message.includes('timeout') || error.message.includes('network'))) {
        
        chatState.retryCount++;
        console.log(`🔄 Tentativa ${chatState.retryCount} de ${CONFIG.MAX_RETRY_ATTEMPTS}`);
        
        showBotTypingAndReply(
          `Conexão instável. Tentando novamente... (${chatState.retryCount}/${CONFIG.MAX_RETRY_ATTEMPTS})`,
          'warning',
          1000
        );
        
        // Retry após 2 segundos
        setTimeout(() => {
          // Reenviar a mesma mensagem
          input.value = text;
          sendChatMessage();
        }, 2000);
        
      } else {
        // Erro definitivo - mostrar mensagem de fallback
        var errorMessage = "⚠️ Não consegui conectar com o servidor. ";
        
        if (error.message.includes('timeout')) {
          errorMessage += "A conexão demorou muito para responder. Tente novamente.";
        } else if (error.message.includes('rate_limited')) {
          errorMessage += "Muitas mensagens enviadas. Aguarde um momento.";
          handleRateLimit();
        } else {
          errorMessage += "Verifique sua conexão e tente novamente em alguns minutos.";
        }
        
        showBotTypingAndReply(errorMessage, 'error');
        
        // Reset retry counter
        chatState.retryCount = 0;
      }
    } finally {
      // Sempre restaurar estado do botão
      chatState.isLoading = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
      }
    }
  }

  // ============================================================================
  // INTEGRAÇÃO WHATSAPP - VERSÃO CORRIGIDA
  // ============================================================================

  // 🔥 FUNÇÃO PRINCIPAL CORRIGIDA - Autoriza e abre WhatsApp
  async function authorizeWhatsAppSession(source, userData = {}) {
    console.log('🚀 [WHATSAPP] Iniciando autorização...', { source, userData });
    
    // Gerar session_id único para WhatsApp
    var sessionId = 'whatsapp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // 🔧 DADOS COMPLETOS para autorização - PHONE_NUMBER OBRIGATÓRIO
    var requestData = {
      session_id: sessionId,
      phone_number: COMMERCIAL_WHATSAPP, // ✅ CORRIGIDO: Usar o número comercial
      source: source,
      user_data: {
        ...userData,
        page_url: window.location.href,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        referrer: document.referrer || 'direct',
        commercial_number: COMMERCIAL_WHATSAPP,
        chat_session_id: chatState.currentSessionId,
        conversation_data: chatState.conversationData
      }
    };

    try {
      console.log('📡 [WHATSAPP] Enviando pré-autorização...', requestData);
      
      // 🔥 CORREÇÃO: Endpoint correto + timeout
      var response = await makeRequestWithTimeout(API_BASE_URL + '/api/v1/whatsapp/authorize', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestData)
      });
      
      console.log('📡 [WHATSAPP] Response status:', response.status);
      
      if (response.ok) {
        var data = await response.json();
        console.log('✅ [WHATSAPP] Pré-autorização realizada:', data);
        
        // Abrir WhatsApp com mensagem personalizada
        var message = generateWhatsAppMessage(userData, source, sessionId);
        var whatsappUrl = 'https://wa.me/' + COMMERCIAL_WHATSAPP + '?text=' + encodeURIComponent(message);
        
        console.log('📱 [WHATSAPP] Abrindo WhatsApp:', whatsappUrl);
        window.open(whatsappUrl, '_blank');
        
        // 🔥 SALVAR sessão para tracking
        try {
          localStorage.setItem('whatsapp_session_id', sessionId);
          localStorage.setItem('whatsapp_authorized_at', new Date().toISOString());
        } catch(e) { console.warn('Não foi possível salvar sessão WhatsApp'); }
        
        return { success: true, session_id: sessionId };
        
      } else {
        var errorText = await response.text();
        console.error('❌ [WHATSAPP] Pré-autorização falhou:', response.status, errorText);
        throw new Error('Pré-autorização falhou: ' + response.status);
      }
      
    } catch (error) {
      console.error('❌ [WHATSAPP] Erro na pré-autorização:', error);
      
      // 🔥 FALLBACK melhorado - abrir WhatsApp mesmo sem autorização
      console.log('🔄 [WHATSAPP] Executando fallback...');
      var fallbackMessage = "Olá! Vim do site m.lima e preciso de ajuda jurídica.";
      
      // Incluir dados do chat se disponíveis
      if (chatState.conversationData && Object.keys(chatState.conversationData).length > 0) {
        fallbackMessage += "\n\nInformações já coletadas no chat:";
        Object.entries(chatState.conversationData).forEach(([key, value]) => {
          fallbackMessage += `\n• ${key}: ${value}`;
        });
      }
      
      var fallbackUrl = 'https://wa.me/' + COMMERCIAL_WHATSAPP + '?text=' + encodeURIComponent(fallbackMessage);
      
      console.log('📱 [WHATSAPP] Fallback - Abrindo WhatsApp direto:', fallbackUrl);
      window.open(fallbackUrl, '_blank');
      
      return { success: false, fallback: true, error: error.message };
    }
  }

  // Gera mensagem COM SESSION_ID para o bot identificar
  function generateWhatsAppMessage(userData, source, sessionId) {
    var baseMessage = "Olá! Vim do site m.lima e preciso de ajuda jurídica urgente.";
    baseMessage += "\n\nGostaria de falar com um advogado especializado para esclarecer algumas dúvidas importantes sobre minha situação.";
    
    // Incluir dados coletados no chat
    if (userData && Object.keys(userData).length > 0) {
      baseMessage += "\n\n📋 Informações já coletadas:";
      Object.entries(userData).forEach(([key, value]) => {
        var label = key === 'name' ? 'Nome' : 
                   key === 'phone' ? 'Telefone' : 
                   key === 'email' ? 'Email' : 
                   key === 'legal_area' ? 'Área Jurídica' : key;
        baseMessage += `\n• ${label}: ${value}`;
      });
    }
    
    // Adicionar contexto específico se disponível
    if (userData.origem && userData.origem !== 'Botão Flutuante') {
      baseMessage += "\n\n📍 Contexto: " + userData.origem;
    }
    
    baseMessage += "\n\nAgradeço desde já a atenção e aguardo retorno.";
    
    // 🔧 ESSENCIAL: Session ID para o bot identificar e responder
    if (sessionId) {
      baseMessage += "\n\n🆔 Sessão: " + sessionId;
      baseMessage += "\n(Este é meu código de identificação para o sistema de atendimento)";
    }
    
    return baseMessage;
  }

  // 🔥 INTERCEPTADOR ULTRA-ROBUSTO - Múltiplas estratégias
  function interceptWhatsAppButtons() {
    console.log('📱 [WHATSAPP] Configurando interceptador ultra-robusto...');
    
    // 🎯 ESTRATÉGIA 1: Event listener com múltiplas verificações
    document.addEventListener('click', function(e) {
      var target = e.target;
      var whatsappElement = null;
      var interceptReason = '';
      
      console.log('🔍 [CLICK] Elemento clicado:', target);
      
      // 🔍 BUSCA PROFUNDA em vários níveis
      var attempts = 0;
      var searchTarget = target;
      
      while (searchTarget && attempts < 8) {
        // Verificação 1: data-testid (react-whatsapp-button)
        if (searchTarget.getAttribute && searchTarget.getAttribute('data-testid') === 'floating-whatsapp-button') {
          whatsappElement = searchTarget;
          interceptReason = 'data-testid=floating-whatsapp-button';
          break;
        }
        
        // Verificação 2: href com wa.me
        if (searchTarget.href && searchTarget.href.includes('wa.me')) {
          whatsappElement = searchTarget;
          interceptReason = 'href-wa.me';
          break;
        }
        
        // Verificação 3: classes WhatsApp
        if (searchTarget.className && typeof searchTarget.className === 'string') {
          var className = searchTarget.className.toLowerCase();
          if (className.includes('whatsapp') || className.includes('wa-') || className.includes('float')) {
            whatsappElement = searchTarget;
            interceptReason = 'className-whatsapp';
            break;
          }
        }
        
        // Verificação 4: ID relacionado
        if (searchTarget.id && typeof searchTarget.id === 'string') {
          var id = searchTarget.id.toLowerCase();
          if (id.includes('whatsapp') || id.includes('wa-') || id.includes('float')) {
            whatsappElement = searchTarget;
            interceptReason = 'id-whatsapp';
            break;
          }
        }
        
        // Verificação 5: atributos React específicos
        var attributes = searchTarget.attributes || [];
        for (var i = 0; i < attributes.length; i++) {
          var attr = attributes[i];
          if (attr.name && attr.name.includes('whatsapp')) {
            whatsappElement = searchTarget;
            interceptReason = 'attribute-whatsapp';
            break;
          }
        }
        
        if (whatsappElement) break;
        
        searchTarget = searchTarget.parentElement;
        attempts++;
      }
      
      if (whatsappElement) {
        console.log('🔥 [WHATSAPP] BOTÃO INTERCEPTADO!');
        console.log('📍 Razão:', interceptReason);
        console.log('🎯 Elemento:', whatsappElement);
        
        // Para TODOS os eventos
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Executar autorização com dados do chat
        authorizeWhatsAppSession('floating_button', {
          origem: 'Botão Flutuante Interceptado',
          site: 'm.lima',
          intercept_method: interceptReason,
          ...chatState.conversationData
        });
        
        return false;
      }
    }, { 
      capture: true,
      passive: false
    });
    
    // 🎯 ESTRATÉGIA 2: Observer para botões criados dinamicamente
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Procurar novos botões WhatsApp
              var selectors = [
                '[data-testid="floating-whatsapp-button"]',
                'a[href*="wa.me"]',
                '[class*="whatsapp"]',
                '[class*="float"]',
                '[id*="whatsapp"]',
                'button[class*="whatsapp"]'
              ];
              
              selectors.forEach(function(selector) {
                try {
                  var found = node.querySelectorAll ? node.querySelectorAll(selector) : [];
                  if (found.length > 0) {
                    console.log('📱 [OBSERVER] Novos botões WhatsApp detectados:', selector, found.length);
                    
                    // Adicionar evento específico a cada novo botão
                    found.forEach(function(btn) {
                      btn.addEventListener('click', function(e) {
                        console.log('🔥 [OBSERVER] Botão WhatsApp clicado via Observer!');
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        authorizeWhatsAppSession('floating_button_observer', {
                          origem: 'Botão via Observer',
                          site: 'm.lima',
                          selector_matched: selector,
                          ...chatState.conversationData
                        });
                      }, { capture: true, passive: false });
                    });
                  }
                } catch(e) {
                  // Ignorar erros de seletor
                }
              });
            }
          });
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('✅ [WHATSAPP] Interceptador configurado com sucesso!');
  }

  // ============================================================================
  // INICIALIZAÇÃO E EXPOSIÇÃO PÚBLICA
  // ============================================================================

  // Inicialização principal
  function initialize() {
    console.log('🚀 Inicializando Chat + WhatsApp Integration PRODUCTION v3.0...');
    console.log('🔧 Backend URL:', API_BASE_URL);
    console.log('📱 WhatsApp Comercial:', COMMERCIAL_WHATSAPP);
    console.log('🎯 Usando sistema production-ready com timeout, retry e rate limiting');
    
    // Inicializar chat
    mountChatUI();
    
    // Configurar integração WhatsApp
    setTimeout(function() {
      interceptWhatsAppButtons();
    }, 1000);
    
    // 🔥 TESTE automático se estiver em desenvolvimento
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
      console.log('🧪 [DEV] Modo desenvolvimento detectado');
      window.testWhatsApp = function() {
        authorizeWhatsAppSession('dev_test', { 
          test: true, 
          timestamp: new Date().toISOString(),
          ...chatState.conversationData
        });
      };
    }
  }

  // Event listener para inicialização
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Configurar botão launcher do chat (se existir)
  document.addEventListener('DOMContentLoaded', function() {
    var launcher = document.getElementById('chat-launcher');
    if(launcher) {
      launcher.addEventListener('click', function() {
        var chatRoot = document.getElementById('chat-root');
        if(chatRoot) {
          chatRoot.classList.toggle('active');
        }
      });
    }
  });

  // ============================================================================
  // API PÚBLICA - VERSÃO EXPANDIDA PRODUCTION
  // ============================================================================

  // Expor funcionalidades do Chat
  window.ChatWidget = {
    setBackend: function(url) { 
      API_BASE_URL = url; 
      localStorage.setItem('backend_url', url);
      console.log('🔧 Backend URL atualizada:', url);
    },
    sendMessage: sendChatMessage,
    addMessage: addChatMessage,
    clearSession: function() {
      chatState.currentSessionId = null;
      chatState.conversationData = {};
      localStorage.removeItem('chat_session_data');
      console.log('🧹 Sessão do chat limpa');
    },
    getState: function() {
      return {
        isLoading: chatState.isLoading,
        rateLimited: chatState.rateLimited,
        sessionId: chatState.currentSessionId,
        conversationData: chatState.conversationData,
        lastCorrelationId: chatState.lastCorrelationId
      };
    },
    startConversation: function() {
      console.log('🔧 Iniciando conversa manualmente...');
      addChatMessage("Conversa iniciada! Digite 'oi' para começar.", 'bot');
    }
  };

  // 🔥 API EXPANDIDA do WhatsApp com DEBUG
  window.WhatsAppIntegration = {
    test: function(source) {
      console.log('🧪 Testando integração WhatsApp...');
      return authorizeWhatsAppSession(source || 'manual_test', { 
        test: true, 
        timestamp: new Date().toISOString(),
        manual: true,
        ...chatState.conversationData
      });
    },
    authorize: authorizeWhatsAppSession,
    reintercept: interceptWhatsAppButtons,
    setCommercialNumber: function(number) {
      COMMERCIAL_WHATSAPP = number;
      console.log('📱 Número comercial atualizado:', number);
    },
    setBackend: function(url) {
      API_BASE_URL = url;
      localStorage.setItem('backend_url', url);
      console.log('🔧 Backend URL atualizada para WhatsApp:', url);
    },
    openWhatsApp: function(source, userData) {
      console.log('🔄 Abrindo WhatsApp manualmente...', { source, userData });
      return authorizeWhatsAppSession(source || 'manual', {
        ...userData,
        ...chatState.conversationData
      });
    },
    getStatus: function() {
      return {
        commercial_number: COMMERCIAL_WHATSAPP,
        backend_url: API_BASE_URL,
        last_session: localStorage.getItem('whatsapp_session_id'),
        last_authorized: localStorage.getItem('whatsapp_authorized_at'),
        chat_state: chatState
      };
    },
    clearSession: function() {
      localStorage.removeItem('whatsapp_session_id');
      localStorage.removeItem('whatsapp_authorized_at');
      console.log('🧹 Sessão WhatsApp limpa');
    },
    debugElements: function() {
      console.log('🔍 [DEBUG] Procurando elementos WhatsApp na página...');
      
      var selectors = [
        '[data-testid="floating-whatsapp-button"]',
        'a[href*="wa.me"]',
        '[class*="whatsapp"]',
        '[class*="float"]',
        '[id*="whatsapp"]',
        'button[class*="whatsapp"]'
      ];
      
      selectors.forEach(function(selector) {
        try {
          var elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            console.log(`✅ Encontrado ${elements.length} elemento(s) com: ${selector}`);
            elements.forEach(function(el, index) {
              console.log(`   [${index}] TagName: ${el.tagName}, Class: "${el.className}", ID: "${el.id}"`);
            });
          } else {
            console.log(`❌ Nenhum elemento encontrado para: ${selector}`);
          }
        } catch(e) {
          console.log(`⚠️ Erro ao buscar: ${selector} - ${e.message}`);
        }
      });
      
      return {
        total_found: selectors.reduce((acc, sel) => acc + document.querySelectorAll(sel).length, 0),
        selectors_tested: selectors.length
      };
    },
    forceIntercept: function(elementSelector) {
      console.log('🎯 [FORCE] Forçando interceptação em:', elementSelector);
      
      var element = document.querySelector(elementSelector);
      if (!element) {
        console.log('❌ [FORCE] Elemento não encontrado:', elementSelector);
        return false;
      }
      
      element.addEventListener('click', function(e) {
        console.log('🔥 [FORCE] Elemento interceptado via forceIntercept!');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        authorizeWhatsAppSession('force_intercept', {
          origem: 'Interceptação Forçada',
          site: 'm.lima',
          selector: elementSelector,
          ...chatState.conversationData
        });
      }, { capture: true, passive: false });
      
      console.log('✅ [FORCE] Listener adicionado com sucesso!');
      return true;
    }
  };

  console.log('✅ Chat.js PRODUCTION v3.0 carregado completamente!');
  console.log('💡 Use ChatWidget.* ou WhatsAppIntegration.* no console para debug');
  console.log('🔥 MELHORIAS PRODUCTION IMPLEMENTADAS:');
  console.log('   ✅ Detecção robusta de fluxo completo');
  console.log('   ✅ Rate limiting com cooldown visual');
  console.log('   ✅ Timeout de 10s + retry automático');
  console.log('   ✅ Loading states com animação');
  console.log('   ✅ Extração inteligente de dados');
  console.log('   ✅ Tratamento de múltiplos response_types');
  console.log('   ✅ Persistência de sessão');
  console.log('   ✅ Barra de progresso baseada em confidence');
  console.log('   ✅ Error recovery graceful');
  console.log('   ✅ Correlation IDs para debugging');

})();