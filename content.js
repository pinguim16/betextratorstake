chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'extractBets') {
      const { startDate, endDate } = request.data;

      try {
          const data = await extractBets(startDate, endDate);
          if (data.length > 0) {
              downloadCSV(data);
              sendResponse({ success: true, dataLength: data.length });
          } else {
              console.log('Nenhuma aposta encontrada no intervalo especificado.');
              sendResponse({ success: false, message: 'Nenhuma aposta encontrada.' });
          }
      } catch (error) {
          console.error('Erro durante a extração:', error);
          sendResponse({ success: false, message: error.message });
      }
  }
  return true; // Indica que a resposta será enviada de forma assíncrona
});

async function extractBets(startDate, endDate) {
  const bets = [];
  let hasNextPage = true;

  while (hasNextPage) {
      const pageBets = extractBetsFromPage(startDate, endDate);
      bets.push(...pageBets);

      hasNextPage = await navigateToNextPage();

      // Verificação para evitar loops infinitos
      if (!hasNextPage || pageBets.length === 0) {
          break;
      }
  }

  return bets;
}

function extractBetsFromPage(startDate, endDate) {
  const bets = [];
  const betElements = document.querySelectorAll('div.sport-bet-preview.svelte-ed9n5k');

  betElements.forEach((betElement) => {
      const dateElement = betElement.querySelector('div.date-time.svelte-ed9n5k span');
      const dateText = dateElement ? dateElement.innerText.trim() : null;
      const betDate = parseDate(dateText); // Para comparações de data

      if (betDate && betDate >= startDate && betDate <= endDate) {
          const betData = parseBetData(betElement, betDate);
          bets.push(betData);
      }
  });

  return bets;
}

// Função original para comparações de data
function parseDate(dateText) {
  if (!dateText) return null;

  const [timePart, datePart] = dateText.split(' ');
  const [day, month, year] = datePart.split('/');

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Nova função para formatar data e hora no padrão YYYY-MM-DD HH:mm para o CSV
function formatDateForCSV(dateText) {
  if (!dateText) return null;

  const [timePart, datePart] = dateText.split(' ');
  const [day, month, year] = datePart.split('/');

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart}`;
}

function parseBetData(betElement, betDate) {
  const stateElement = betElement.querySelector('div.badge');
  let state = 'Unknown';

  if (stateElement) {
      if (stateElement.classList.contains('variant-success')) {
          state = 'W'; // Win
      } else if (stateElement.classList.contains('variant-light')) {
          state = 'L'; // Loss
      }
  }

  const eventNameElement = betElement.querySelector('div.title-wrapper.svelte-16byt0j span.truncate.svelte-16byt0j');
  const eventName = eventNameElement ? eventNameElement.innerText.trim() : '';

  const additionalInfoElements = betElement.querySelectorAll('span.weight-normal.line-height-default.align-left.size-default.text-size-default.variant-subtle.with-icon-space.svelte-17v69ua');
  const additionalInfo = additionalInfoElements.length > 1 ? additionalInfoElements[1].innerText.trim() : '';

  const selectedOutcomeElement = betElement.querySelector('div.outcome-name.svelte-16byt0j span.weight-semibold');
  const selectedOutcome = selectedOutcomeElement ? selectedOutcomeElement.innerText.trim() : '';

  let label = `${eventName} - ${additionalInfo} - ${selectedOutcome}`;

  // Preenche o campo "Category" com ML ou MS baseado na presença da palavra "vencedor"
  let category = "MS";
  if (label.toLowerCase().includes('vencedor')) {
      category = "ML";
  }

  const stakeElement = betElement.querySelector('div.total-stake.svelte-ed9n5k span.weight-normal');
  let stake = stakeElement ? stakeElement.innerText.trim().replace('R$', '').replace(',', '.').trim() : '0.00';

  const oddsElement = betElement.querySelector('span.weight-bold.line-height-default.align-left.size-default.text-size-default.variant-action.with-icon-space.svelte-17v69ua');
  let odds = oddsElement ? oddsElement.innerText.trim().replace(',', '.').trim() : '0.00';

  // Usar formatDateForCSV para a formatação de data e hora na planilha
  const formattedBetDate = formatDateForCSV(betElement.querySelector('div.date-time.svelte-ed9n5k span').innerText.trim());

  return [
      formattedBetDate, // Data formatada para o CSV
      'S',
      'eSport',
      label,
      odds,
      stake,
      state,
      'Stake',
      '',
      category, // Preenche o campo Category com ML ou MS
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
  ].join(';');
}

let downloaded = false; // Variável de controle para garantir download único

function downloadCSV(data) {
  if (downloaded) return; // Evita múltiplos downloads

  const csvHeader = "Date;Type;Sport;Label;Odds;Stake;State;Bookmaker;Tipster;Category;Competition;BetType;Closing;Commission;Live;Freebet;Cashout;EachWay;Comment";
  const csvContent = [csvHeader, ...data].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `bets_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  downloaded = true; // Marca o download como concluído
}

async function navigateToNextPage() {
  const nextButton = document.querySelector('a[data-test="pagination-next"]');
  if (nextButton && !nextButton.classList.contains('disabled')) {
      nextButton.click();
      await new Promise(resolve => setTimeout(resolve, 3000)); // Aguarda 3 segundos para carregar a próxima página
      return true;
  }
  return false;
}
