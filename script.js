// Referències al modal
const modal = document.getElementById("myModal");
const titolModal = document.getElementById("modal-titol");
const textModal = document.getElementById("modal-text");

// Funció per generar el missatge HTML amb PIN ocult
function crearMissatge(dia, frase, pin) {
  return `
    <div class="pin-container">
      <p>Avui és el dia ${dia}! ${frase}</p>
      <div class="pin-rasca" onclick="revelarPin(this)" data-pin="${pin}">
        🔐 Clica per revelar el codi del candau
      </div>
    </div>
  `;
}

// Missatges per cada dia
const missatgesAdvent = {
  "1":  { titol: "Dia 1",  text: crearMissatge(1, "Comença la màgia!", "1234") },
  "2":  { titol: "Dia 2",  text: crearMissatge(2, "Somriure extra!", "5678") },
  "3":  { titol: "Dia 3",  text: crearMissatge(3, "Detall dolç!", "9012") },
  "4":  { titol: "Dia 4",  text: crearMissatge(4, "Abraça fort!", "3456") },
  "5":  { titol: "Dia 5",  text: crearMissatge(5, "Record brillant!", "8421") },
  "6":  { titol: "Dia 6",  text: crearMissatge(6, "Mima’t!", "7788") },
  "7":  { titol: "Dia 7",  text: crearMissatge(7, "Gest petit!", "1122") },
  "8":  { titol: "Dia 8",  text: crearMissatge(8, "Sorpresa!", "3344") },
  "9":  { titol: "Dia 9",  text: crearMissatge(9, "Compartir!", "5566") },
  "10": { titol: "Dia 10", text: crearMissatge(10, "Riure!", "7788") },
  "11": { titol: "Dia 11", text: crearMissatge(11, "Pensar en tu!", "9900") },
  "12": { titol: "Dia 12", text: crearMissatge(12, "Et regalo temps!", "2468") },
  "13": { titol: "Dia 13", text: crearMissatge(13, "Somiar!", "1357") },
  "14": { titol: "Dia 14", text: crearMissatge(14, "Brillar!", "8642") },
  "15": { titol: "Dia 15", text: crearMissatge(15, "T’estimo!", "9753") },
  "16": { titol: "Dia 16", text: crearMissatge(16, "Pau!", "1029") },
  "17": { titol: "Dia 17", text: crearMissatge(17, "Cuidar-te!", "3141") },
  "18": { titol: "Dia 18", text: crearMissatge(18, "Abraçada!", "6283") },
  "19": { titol: "Dia 19", text: crearMissatge(19, "Sentir especial!", "4567") },
  "20": { titol: "Dia 20", text: crearMissatge(20, "Descansar!", "8901") },
  "21": { titol: "Dia 21", text: crearMissatge(21, "Celebrar!", "2345") },
  "22": { titol: "Dia 22", text: crearMissatge(22, "Regal!", "6789") },
  "23": { titol: "Dia 23", text: crearMissatge(23, "Gràcies!", "3210") },
  "24": { titol: "Dia 24", text: crearMissatge(24, "Bon Nadal!", "9999") }
};

// Mostrar el modal amb HTML
function mostrarModal(dia) {
  const contingut = missatgesAdvent[dia];
  if (!contingut) return;
  titolModal.textContent = contingut.titol;
  textModal.innerHTML = contingut.text;
  modal.style.display = "block";
}

// Revelar el PIN
function revelarPin(element) {
  const pin = element.dataset.pin;
  element.textContent = `🔓 Codi del candau: ${pin}`;
  element.classList.add("revelat");
}

// Tancar el modal
function tancarModal() {
  modal.style.display = "none";
}

// Tancar si es clica fora o amb Esc
window.addEventListener("click", (event) => {
  if (event.target === modal) tancarModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.style.display === "block") {
    tancarModal();
  }
});

// Obrir finestra del calendari
function obrirFinestra(element) {
  const dia = element.dataset.day;
  if (element.classList.contains("bloquejat")) return;

  if (!element.classList.contains("oberta")) {
    element.classList.add("obre");
    setTimeout(() => {
      element.classList.remove("obre");
      element.classList.add("oberta");
      localStorage.setItem(`porta-${dia}`, "oberta");
      mostrarModal(dia);
    }, 600);
  } else {
    mostrarModal(dia);
  }
}

// Carregar estat des de localStorage
function carregarEstatFinestres() {
  document.querySelectorAll(".finestra").forEach(f => {
    const dia = f.dataset.day;
    if (localStorage.getItem(`porta-${dia}`) === "oberta") {
      f.classList.add("oberta");
    }
  });
}

// Assignar listeners
function inicialitzarFinestres() {
  document.querySelectorAll(".finestra").forEach(f => {
    f.addEventListener("click", (e) => {
      e.preventDefault();
      obrirFinestra(f);
    });
  });
}

// Bloquejar dies futurs (només si és desembre)
function verificarDies() {
  const avui = new Date();
  const dia = avui.getDate();
  const mes = avui.getMonth(); // 0 = gener, 11 = desembre

  document.querySelectorAll(".finestra").forEach(f => {
    const diaFinestra = parseInt(f.dataset.day);
    if (mes !== 9 || diaFinestra > dia) {
      f.classList.add("bloquejat");
    }
  });
}

// Generar neu
function generarNeu(num = 50) {
  const container = document.getElementById("neu-container");
  if (!container) return;

  container.innerHTML = ""; // neteja flocs antics

  for (let i = 0; i < num; i++) {
    const floc = document.createElement("div");
    floc.className = "floc";
    floc.style.left = Math.random() * 100 + "vw";
    floc.style.animationDuration = (3 + Math.random() * 5) + "s";
    floc.style.opacity = Math.random();
    container.appendChild(floc);
  }
}

// Inicialització
document.addEventListener("DOMContentLoaded", () => {
  generarNeu();

  const boto = document.getElementById("boton-calendari");
  if (boto) {
    boto.addEventListener("click", () => {
      window.location.href = "calendari.html";
    });
  }

  if (document.querySelector(".finestra")) {
    carregarEstatFinestres();
    inicialitzarFinestres();
    verificarDies();
  }
});
