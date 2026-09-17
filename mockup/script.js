// Mock-only interactivity: clicking "Choose Photo" simulates a scan and reveals the result card.
document.addEventListener('DOMContentLoaded', () => {
  const chooseBtn = document.querySelector('.dropzone .btn-primary');
  const resultCard = document.querySelector('.result-card');

  if (chooseBtn && resultCard) {
    resultCard.style.opacity = '1';

    chooseBtn.addEventListener('click', () => {
      chooseBtn.textContent = 'Scanning... 🔍';
      resultCard.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      resultCard.style.opacity = '0.3';
      resultCard.style.transform = 'scale(0.98)';

      setTimeout(() => {
        chooseBtn.textContent = 'Choose Photo';
        resultCard.style.opacity = '1';
        resultCard.style.transform = 'scale(1)';
      }, 900);
    });
  }

  // Smooth scroll for nav links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});
