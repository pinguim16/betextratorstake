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
  const stopDate = subtractDays(new Date(startDate), 2);

  while (hasNextPage) {
      const pageBets = extractBetsFromPage(startDate, endDate);
      bets.push(...pageBets);

      const betElements = document.querySelectorAll('div.sport-bet-preview.svelte-ed9n5k');
      if (betElements.length > 0) {
          const firstBetDate = parseDate(betElements[0].querySelector('div.date-time.svelte-ed9n5k span').innerText.trim());
          const lastBetDate = parseDate(betElements[betElements.length - 1].querySelector('div.date-time.svelte-ed9n5k span').innerText.trim());

          // Verifica se deve continuar navegando
          if (lastBetDate && new Date(lastBetDate) > stopDate) {
              hasNextPage = await navigateToNextPage();
          } else {
              break; // Interrompe a busca se a última data estiver antes do intervalo desejado
          }
      } else {
          hasNextPage = false; // Se não houver apostas na página, interrompe a navegação
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
      const betDate = parseDate(dateText);

      if (betDate && betDate >= startDate && betDate <= endDate) {
          const betData = parseBetData(betElement, dateText); // Passa dateText para parseBetData
          bets.push(betData);
      }
  });

  return bets;
}

// Função para parse de data para localização das apostas
function parseDate(dateText) {
  if (!dateText) return null;

  const [timePart, datePart] = dateText.split(' ');
  const [day, month, year] = datePart.split('/');

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Função para formatar a data para o CSV no formato YYYY-MM-DD HH:mm
function formatDateForCSV(dateText) {
  if (!dateText) return null;

  const [timePart, datePart] = dateText.split(' ');
  const [day, month, year] = datePart.split('/');

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart}`;
}

function subtractDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function parseBetData(betElement, dateText) {
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

  const label = `${eventName} - ${additionalInfo} - ${selectedOutcome}`;

  const stakeElement = betElement.querySelector('div.total-stake.svelte-ed9n5k span.weight-normal');
  let stake = stakeElement ? stakeElement.innerText.trim().replace('R$', '').replace(',', '.').trim() : '0.00';

  const oddsElement = betElement.querySelector('span.weight-bold.line-height-default.align-left.size-default.text-size-default.variant-action.with-icon-space.svelte-17v69ua');
  let odds = oddsElement ? oddsElement.innerText.trim().replace(',', '.').trim() : '0.00';

  // Verifica se dateText é válido antes de tentar formatá-lo
  const formattedDate = dateText ? formatDateForCSV(dateText) : '';

  // Define a categoria com base na presença da palavra "vencedor" no label
  const category = label.toLowerCase().includes('vencedor') ? 'ML' : 'MS';

  return [
      formattedDate, // Data formatada para o CSV
      'S',
      'eSport',
      label,
      odds,
      stake,
      state,
      'Stake',
      '',
      category, // Categoria definida aqui
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

async function navigateToNextPage() {
  const nextButton = document.querySelector('a[data-test="pagination-next"]');
  if (nextButton && !nextButton.classList.contains('disabled')) {
      nextButton.click();
      await new Promise(resolve => setTimeout(resolve, 3000)); // Aguarda 3 segundos para carregar a próxima página
      return true;
  }
  return false;
}

function downloadCSV(data) {
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
}
