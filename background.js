chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startExtraction') {
        const { tabId, startDate, endDate } = request.data;

        // Injeta o script de conteúdo na aba ativa
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Erro ao injetar o script de conteúdo:', chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }

            // Envia uma mensagem ao content script para iniciar a extração
            chrome.tabs.sendMessage(tabId, {
                action: 'extractBets',
                data: {
                    startDate: startDate,
                    endDate: endDate
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Erro ao comunicar com o script de conteúdo:', chrome.runtime.lastError.message);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else if (!response) {
                    console.error('Nenhuma resposta do script de conteúdo.');
                    sendResponse({ success: false, error: 'Nenhuma resposta do script de conteúdo.' });
                } else {
                    console.log('Resposta recebida do script de conteúdo:', response);
                    sendResponse({ success: true, data: response });
                }
            });
        });

        return true; // Indica que a resposta será enviada de forma assíncrona
    }
});
