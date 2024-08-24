function bet365() {
    console.log("Bet365 detected");

    const intervalId = setInterval(() => {
        const betElements = document.querySelectorAll('div.h-BetSummary');

        if (betElements.length > 0) {
            console.log(`${betElements.length} elementos de aposta encontrados.`);
            betElements.forEach(el => console.log(el.innerHTML)); // Log para verificar a estrutura dos elementos capturados
            clearInterval(intervalId); // Para a verificação contínua quando os elementos forem encontrados
        } else {
            console.log("Nenhum elemento de aposta encontrado.");
        }
    }, 1000); // Verificação a cada 1 segundo
}
