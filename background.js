chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startExtraction') {
      const { tabId, startDate, endDate } = request.data;

      // Injeta o script de conteúdo na guia ativa
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
              } else {
                  sendResponse({ success: true, data: response.data });
              }
          });
      });

      // Retorna true para indicar que a resposta será enviada de forma assíncrona
      return true;
  }
});
