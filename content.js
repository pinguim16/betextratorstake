(function() {
    // Constantes para configuração
    const MAX_PAGES = 50; // Número máximo de páginas a navegar
    const DEBUG_MODE = true; // Defina como true para habilitar logs de depuração

    let isExtracting = false; // Variável de controle para evitar extrações simultâneas

    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
        if (request.action === 'extractBets') {
            const { startDate } = request.data; // Recebe a data fornecida pelo usuário

            // Verifica se a extração já está em andamento
            if (isExtracting) {
                console.log('Extração já está em andamento. Ignorando solicitação duplicada.');
                sendResponse({ success: false, message: 'Extração já está em andamento.' });
                return true; // Retorna true para indicar que a resposta será enviada de forma assíncrona
            }

            isExtracting = true; // Inicia o processo de extração

            try {
                console.log('Iniciando extração para a data:', startDate);

                const data = await extractBets(startDate);

                if (data.size > 0) {
                    console.log('Baixando CSV...');
                    downloadCSV(data, startDate);
                    console.log('Extração concluída com sucesso:', data.size, 'apostas encontradas.');
                    sendResponse({ success: true, data: data.size }); // Envia a resposta após extração bem-sucedida
                } else {
                    console.log('Nenhuma aposta encontrada na data especificada.');
                    sendResponse({ success: false, message: 'Nenhuma aposta encontrada.' });
                }
            } catch (error) {
                console.error('Erro durante a extração:', error);
                sendResponse({ success: false, message: error.message }); // Envia a resposta com o erro
            } finally {
                isExtracting = false; // Redefine a variável de controle
            }

            return true; // Garante que a resposta seja enviada de forma assíncrona
        }
    });

    /**
     * Extrai as apostas para a data especificada, parando quando encontrar apostas 6 dias mais antigas.
     * @param {string} startDateStr - Data inicial no formato 'YYYY-MM-DD'.
     * @returns {Set} Conjunto de apostas extraídas.
     */
    async function extractBets(startDateStr) {
        const bets = new Set();
        let hasNextPage = true;
        let pageCount = 0;

        // Converte a data fornecida para um objeto Date
        const startDate = new Date(`${startDateStr}T00:00:00`);
        startDate.setHours(0, 0, 0, 0); // Define para o início do dia

        // Calcula a data limite (6 dias antes de startDate)
        const stopDate = new Date(startDate);
        stopDate.setDate(stopDate.getDate() - 6);
        stopDate.setHours(0, 0, 0, 0);

        while (hasNextPage && pageCount < MAX_PAGES) {
            console.log(`Processando página ${pageCount + 1}`);
            const pageBets = extractBetsFromPage(startDate, stopDate);

            pageBets.forEach(bet => bets.add(bet));

            const betElements = document.querySelectorAll('div.sport-bet-preview');
            if (betElements.length > 0) {
                const lastBetDateText = getBetDateText(betElements[betElements.length - 1]);
                const lastBetDate = parseDate(lastBetDateText);

                console.log(`Última data de aposta na página: ${lastBetDate} (Texto: ${lastBetDateText})`);
                console.log(`Data limite (stopDate): ${stopDate}`);

                // Verifica se deve continuar navegando
                if (lastBetDate && lastBetDate >= stopDate) {
                    hasNextPage = await navigateToNextPage();
                    pageCount++;
                } else {
                    console.log('Apostas mais antigas que a data limite encontradas. Interrompendo navegação.');
                    break; // Interrompe a busca se a última data for mais antiga que a data limite
                }
            } else {
                hasNextPage = false; // Se não houver apostas na página, interrompe a navegação
            }
        }

        if (pageCount >= MAX_PAGES) {
            console.warn('Número máximo de páginas atingido.');
        }

        return bets;
    }

    /**
     * Extrai as apostas da página atual para a data especificada.
     * Ignora apostas com status "Anular" ou "Cancelado".
     * @param {Date} startDate - Data específica para extração.
     * @param {Date} stopDate - Data limite para interromper a extração (6 dias antes de startDate).
     * @returns {Array} Lista de apostas extraídas.
     */
    function extractBetsFromPage(startDate, stopDate) {
        const bets = [];
        const betElements = document.querySelectorAll('div.sport-bet-preview');

        for (let betElement of betElements) {
            try {
                const dateText = getBetDateText(betElement);
                const betDate = parseDate(dateText);

                if (betDate) {
                    console.log(`Analisando aposta com data: ${betDate} (Texto: ${dateText})`);
                } else {
                    console.warn(`Não foi possível parsear a data: ${dateText}`);
                    continue; // Pula para a próxima aposta
                }

                // Se a aposta for mais antiga que a data limite, marcamos para interromper a extração
                if (betDate < stopDate) {
                    console.log('Aposta mais antiga que a data limite encontrada. Interrompendo extração.');
                    hasNextPage = false;
                    break; // Interrompe o loop de apostas na página
                }

                // Verificar se a aposta deve ser ignorada com base no estado
                const shouldIgnore = shouldIgnoreBet(betElement);
                if (shouldIgnore) {
                    console.log('Aposta com status "Anular" ou "Cancelado" encontrada. Ignorando.');
                    continue; // Pula para a próxima aposta
                }

                if (betDate.toDateString() === startDate.toDateString()) {
                    // Aposta da data especificada
                    const betData = parseBetData(betElement, dateText);
                    bets.push(betData);
                }
            } catch (error) {
                console.error('Erro ao processar aposta:', error);
            }
        }

        return bets;
    }

    /**
     * Verifica se a aposta deve ser ignorada com base no estado.
     * @param {Element} betElement - Elemento DOM da aposta.
     * @returns {boolean} True se a aposta deve ser ignorada, false caso contrário.
     */
    function shouldIgnoreBet(betElement) {
        const stateElement = betElement.querySelector('div.badge');
        if (stateElement) {
            const stateText = stateElement.innerText.trim().toLowerCase();
            if (stateText.includes('anular') || stateText.includes('cancelado')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Obtém o texto da data de um elemento de aposta.
     * @param {Element} betElement - Elemento DOM da aposta.
     * @returns {string|null} Texto da data ou null se não encontrado.
     */
    function getBetDateText(betElement) {
        const dateElement = betElement.querySelector('div.date-time span:not(.badge)');
        return dateElement ? dateElement.innerText.trim() : null;
    }

    /**
     * Converte um texto de data em um objeto Date.
     * @param {string} dateText - Texto da data no formato 'HH:mm DD/MM/YYYY'.
     * @returns {Date|null} Objeto Date ou null se inválido.
     */
    function parseDate(dateText) {
        if (!dateText) return null;

        const [timePart, datePart] = dateText.split(' ');
        const [hours, minutes] = timePart.split(':');
        const [day, month, year] = datePart.split('/');

        // Cria a data considerando o fuso horário local
        const date = new Date(year, month - 1, day, hours, minutes, 0);

        return date;
    }

    /**
     * Formata a data para o CSV no formato 'YYYY-MM-DD HH:mm'.
     * @param {string} dateText - Texto da data original.
     * @returns {string|null} Data formatada ou null se inválida.
     */
    function formatDateForCSV(dateText) {
        if (!dateText) return null;

        const [timePart, datePart] = dateText.split(' ');
        const [hours, minutes] = timePart.split(':');
        const [day, month, year] = datePart.split('/');

        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hours}:${minutes}`;
    }

    /**
     * Faz o parse dos dados de uma aposta.
     * @param {Element} betElement - Elemento DOM da aposta.
     * @param {string} dateText - Texto da data original.
     * @returns {string} Linha formatada para o CSV.
     */
    function parseBetData(betElement, dateText) {
        try {
            // Extrair o estado (Vitória, Derrota, etc.)
            const stateElement = betElement.querySelector('div.badge');
            let state = 'Unknown';

            if (stateElement) {
                const stateText = stateElement.innerText.trim().toLowerCase();
                if (stateText.includes('vitória')) {
                    state = 'W'; // Win
                } else if (stateText.includes('derrota')) {
                    state = 'L'; // Loss
                } else if (stateText.includes('anulada') || stateText.includes('anular') || stateText.includes('cancelado')) {
                    state = 'V'; // Void
                }
            }

            // Nome do evento
            const eventNameElement = betElement.querySelector('div.title-wrapper a span');
            const eventName = eventNameElement ? eventNameElement.innerText.trim() : '';

            // Informações adicionais
            const additionalInfoElement = betElement.querySelector('div.title-wrapper span.weight-normal:not(.with-icon-space)');
            const additionalInfo = additionalInfoElement ? additionalInfoElement.innerText.trim() : '';

            // Resultado selecionado
            const selectedOutcomeElement = betElement.querySelector('div.outcome-name span');
            const selectedOutcome = selectedOutcomeElement ? selectedOutcomeElement.innerText.trim() : '';

            // Construir o label
            const label = `${eventName} - ${additionalInfo} - ${selectedOutcome}`;

            // Stake
            const stakeElement = betElement.querySelector('div.total-stake .currency .weight-normal.numeric span');
            let stake = stakeElement ? stakeElement.innerText.trim().replace('R$', '').replace(',', '.').trim() : '0.00';

            // Odds
            const oddsElement = betElement.querySelector('div.odds[data-test="odds"] span');
            let odds = oddsElement ? oddsElement.innerText.trim().replace(',', '.').trim() : '0.00';

            // Data formatada para o CSV
            const formattedDate = dateText ? formatDateForCSV(dateText) : '';

            // Categoria (ML ou MS)
            const category = label.toLowerCase().includes('vencedor') ? 'ML' : 'MS';

            // Competição
            let competition = getCompetition(betElement);

            // Escapar campos para CSV
            const escapedLabel = escapeCSV(label);

            return [
                formattedDate, 
                'S',
                'eSport',
                escapedLabel,
                odds, 
                stake,
                state,
                'Stake',
                '',
                category, 
                competition,
                '',
                '',
                '',
                '',
                '',
                '',
                ''
            ].join(';');
        } catch (error) {
            console.error('Erro ao parsear dados da aposta:', error);
            throw error;
        }
    }

    /**
     * Obtém o nome da competição com base nos elementos DOM.
     * @param {Element} betElement - Elemento DOM da aposta.
     * @returns {string} Nome da competição ou vazio se não encontrado.
     */
    function getCompetition(betElement) {
        // Tentar extrair a competição a partir do link ou outras informações
        const linkElement = betElement.querySelector('div.title-wrapper a');
        if (linkElement) {
            const href = linkElement.getAttribute('href');
            if (href) {
                if (href.includes('csgo')) {
                    return 'CS';
                } else if (href.includes('dota')) {
                    return 'Dota';
                } else if (href.includes('league-of-legends') || href.includes('lol')) {
                    return 'LOL';
                } else if (href.includes('valorant')) {
                    return 'Valorant';
                }
            }
        }

        // Caso não encontre, retornar vazio
        return '';
    }

    /**
     * Navega para a próxima página de apostas.
     * @returns {Promise<boolean>} True se navegou para a próxima página, false caso contrário.
     */
    async function navigateToNextPage() {
        const nextButton = document.querySelector('a[data-testid="pagination-next"]');
        if (nextButton) {
            // Verifica se o botão está desabilitado (pode verificar se tem a classe 'disabled' ou atributo 'aria-disabled')
            if (!nextButton.classList.contains('disabled') && !nextButton.getAttribute('disabled') && !nextButton.getAttribute('aria-disabled')) {
                console.log('Botão "Próximo" encontrado e ativo. Clicando para ir para a próxima página.');
                nextButton.click();
                await waitForNewContent();
                return true;
            } else {
                console.log('Botão "Próximo" está desabilitado. Fim da navegação.');
                return false;
            }
        } else {
            console.log('Botão "Próximo" não encontrado.');
            return false;
        }
    }

    /**
     * Aguarda até que o novo conteúdo seja carregado na página.
     * @returns {Promise<void>}
     */
    function waitForNewContent() {
        return new Promise((resolve) => {
            const betList = document.querySelector('div.bet-list') || document.querySelector('div.main-content') || document.querySelector('div.sport-bet-list'); // Ajuste o seletor conforme necessário
            if (!betList) {
                console.error('Container de apostas não encontrado para observar mudanças.');
                resolve();
                return;
            }
            const observer = new MutationObserver((mutations, obs) => {
                if (mutations.some(mutation => mutation.addedNodes.length > 0)) {
                    obs.disconnect();
                    console.log('Novo conteúdo detectado. Aguardando carregamento completo.');
                    setTimeout(() => {
                        resolve();
                    }, 2000); // Aguarda 2 segundos
                }
            });
            observer.observe(betList, { childList: true, subtree: true });
        });
    }

    /**
     * Faz o download do CSV com as apostas extraídas.
     * @param {Set} betsSet - Conjunto de apostas.
     * @param {string} startDateStr - Data inicial.
     */
    function downloadCSV(betsSet, startDateStr) {
        const csvHeader = "Date;Type;Sport;Label;Odds;Stake;State;Bookmaker;Tipster;Category;Competition;BetType;Closing;Commission;Live;Freebet;Cashout;EachWay;Comment";
        const data = Array.from(betsSet);
        const csvContent = [csvHeader, ...data].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        try {
            const fileName = sanitizeFileName(`bet_stake_${startDateStr}.csv`);

            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao gerar o nome do arquivo:', error);
        }
    }

    /**
     * Remove caracteres inválidos do nome do arquivo.
     * @param {string} name - Nome original do arquivo.
     * @returns {string} Nome sanitizado.
     */
    function sanitizeFileName(name) {
        return name.replace(/[<>:"/\\|?*]+/g, '_');
    }

    /**
     * Escapa caracteres especiais para uso no CSV.
     * @param {string} value - Valor original.
     * @returns {string} Valor escapado.
     */
    function escapeCSV(value) {
        if (typeof value === 'string' && (value.includes(';') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
})();
