// Coordinación vecinal: mapa de acciones (pestaña Mapa) y formulario para informar (pestaña Informar).

const CENTRO = [37.391, -5.993];
const LIMITES = [[37.290, -6.060], [37.470, -5.800]];  // municipio de Sevilla
const ZOOM_SELECCION = 16;  // por debajo, tocar el mapa acerca en vez de seleccionar
const COLORES = { carteles: "#e8710a", carteles_calle: "#9334e6", buzoneo: "#1a73e8", panfletos: "#188038" };
const NOMBRES = {
  carteles: "Comercios (carteles, huelga, ...)", carteles_calle: "Carteles en la calle",
  buzoneo: "Buzoneo", panfletos: "Panfletos",
};
const CANTIDADES = {  // texto de ayuda del campo Cantidad según el tipo
  carteles: "Nº de comercios", carteles_calle: "Nº de carteles",
  buzoneo: "Nº de cartas", panfletos: "Nº de panfletos",
};

const calles = {};     // id del tramo -> feature GeoJSON
const porNombre = {};  // nombre de la calle -> [ids de sus tramos]
let informes = [];

/* ---------- Utilidades ---------- */

function crearMapa(id) {
  const mapa = L.map(id, {
    center: CENTRO, zoom: 15, minZoom: 12, maxBounds: LIMITES,
    renderer: L.canvas({ tolerance: 8 }),  // líneas más fáciles de tocar en el móvil
  });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);
  return mapa;
}

const latlngs = id => calles[id].geometry.coordinates.map(([lon, lat]) => [lat, lon]);

const hoy = () => new Date().toLocaleDateString("sv");  // AAAA-MM-DD en hora local

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function fechaLegible(fecha) {
  const [a, m, d] = String(fecha).split("-");
  return `${d}/${m}/${a}`;
}

/* ---------- Pestañas ---------- */

function mostrarVista() {
  const vista = location.hash === "#informar" ? "informar" : "mapa";
  document.querySelectorAll(".vista").forEach(s => s.classList.toggle("activa", s.id === "vista-" + vista));
  document.querySelectorAll(".pestana").forEach(a => a.classList.toggle("activa", a.dataset.vista === vista));
  if (vista === "mapa") {
    mapa.invalidateSize();
    cargarInformes();
  } else {
    mapaInformar.invalidateSize();
  }
}

/* ---------- Pestaña Mapa ---------- */

const mapa = crearMapa("mapa");
const capaInformes = L.layerGroup().addTo(mapa);

async function cargarInformes() {
  const aviso = document.getElementById("aviso-mapa");
  try {
    const resp = await fetch(URL_APPS_SCRIPT || "data/ejemplo.json");
    informes = await resp.json();
    aviso.hidden = Boolean(URL_APPS_SCRIPT);
    aviso.className = "aviso";
    aviso.textContent = "Modo de prueba: se muestran datos de ejemplo.";
  } catch {
    aviso.hidden = false;
    aviso.className = "aviso error";
    aviso.textContent = "No se han podido cargar los informes. Prueba a recargar la página.";
  }
  dibujarInformes();
}

function textoPopup(informe, calle) {
  return [
    `<strong>${NOMBRES[informe.tipo]}</strong>`,
    calle && escapar(calle),
    fechaLegible(informe.fecha),
    informe.cantidad && `Cantidad: ${escapar(String(informe.cantidad))}`,
    informe.nota && escapar(informe.nota),
  ].filter(Boolean).join("<br>");
}

function dibujarInformes() {
  capaInformes.clearLayers();
  const tipos = [...document.querySelectorAll("input[name=capa]:checked")].map(c => c.value);
  const dias = Number(document.getElementById("periodo").value);
  const desde = dias ? new Date(Date.now() - dias * 864e5).toLocaleDateString("sv") : "";
  // De abajo arriba: buzoneo (ancha), carteles en la calle (discontinua), comercios (fina).
  // Así se ven todos en la misma calle
  const orden = { buzoneo: 0, carteles_calle: 1, carteles: 2, panfletos: 3 };
  const estilos = {
    buzoneo: { color: COLORES.buzoneo, weight: 10, opacity: 0.55 },
    carteles_calle: { color: COLORES.carteles_calle, weight: 8, opacity: 1, dashArray: "8 6" },
    carteles: { color: COLORES.carteles, weight: 4, opacity: 1 },
  };

  informes
    .filter(i => tipos.includes(i.tipo) && String(i.fecha) >= desde)
    .sort((a, b) => orden[a.tipo] - orden[b.tipo])
    .forEach(i => {
      if (i.tipo === "panfletos") {
        L.circleMarker([i.lat, i.lon], { radius: 8, color: "#fff", weight: 2, fillColor: COLORES.panfletos, fillOpacity: 0.9 })
          .bindPopup(textoPopup(i))
          .addTo(capaInformes);
        return;
      }
      String(i.calles).split(" ").filter(id => calles[id]).forEach(id => {
        L.polyline(latlngs(id), estilos[i.tipo])
          .bindPopup(textoPopup(i, calles[id].properties.nombre))
          .addTo(capaInformes);
      });
    });
}

/* ---------- Pestaña Informar ---------- */

const form = document.getElementById("formulario");
const cantidadGeneral = form.elements.cantidad.placeholder;  // antes de elegir tipo
const mapaInformar = crearMapa("mapa-informar");
const buscar = document.getElementById("buscar");
const todaCalle = document.getElementById("toda-calle");
const seleccion = new Set();  // ids de tramos marcados
let marcador = null;          // punto marcado (panfletos)
let capaCalles;               // todos los tramos, para tocarlos

function estiloTramo(id) {
  return seleccion.has(id)
    ? { color: COLORES[form.elements.tipo.value], weight: 7, opacity: 1 }
    : { color: "#7a1f2b", weight: 4, opacity: 0.35 };
}

function actualizarSeleccion(texto) {
  capaCalles.setStyle(f => estiloTramo(f.properties.id));
  if (texto === undefined) {
    const cuenta = {};
    seleccion.forEach(id => {
      const nombre = calles[id].properties.nombre;
      cuenta[nombre] = (cuenta[nombre] || 0) + 1;
    });
    const lista = Object.entries(cuenta).map(([n, k]) => `${n} (${k} ${k === 1 ? "tramo" : "tramos"})`);
    texto = marcador ? "Punto marcado." : lista.length ? "Marcado: " + lista.join(", ") : "";
  }
  document.getElementById("seleccion").textContent = texto;
  document.getElementById("borrar").hidden = !seleccion.size && !marcador;
}

function cambiarTipo() {
  const modo = form.elements.tipo.value === "panfletos" ? "punto" : "calle";
  form.dataset.modo = modo;
  form.elements.cantidad.placeholder = CANTIDADES[form.elements.tipo.value];
  if (modo === "punto") {
    seleccion.clear();
    capaCalles.remove();
  } else {
    quitarPunto();
    capaCalles.addTo(mapaInformar);
  }
  actualizarSeleccion();
}

function tocarTramo(id, e) {
  L.DomEvent.stopPropagation(e);
  if (mapaInformar.getZoom() < ZOOM_SELECCION) {
    mapaInformar.setView(e.latlng, ZOOM_SELECCION + 1);
    return;
  }
  if (seleccion.has(id)) seleccion.delete(id);
  else seleccion.add(id);
  actualizarSeleccion();
}

function ponerPunto(latlng) {
  if (marcador) marcador.setLatLng(latlng);
  else marcador = L.circleMarker(latlng, { radius: 9, color: "#fff", weight: 2, fillColor: COLORES.panfletos, fillOpacity: 1 }).addTo(mapaInformar);
  actualizarSeleccion();
}

function quitarPunto() {
  if (marcador) marcador.remove();
  marcador = null;
}

function avisar(texto, clase) {
  const mensaje = document.getElementById("mensaje");
  mensaje.hidden = false;
  mensaje.className = "aviso " + clase;
  mensaje.textContent = texto;
}

function reiniciarFormulario() {
  form.reset();
  form.elements.fecha.value = hoy();
  delete form.dataset.modo;
  form.elements.cantidad.placeholder = cantidadGeneral;
  seleccion.clear();
  quitarPunto();
  capaCalles.remove();
  todaCalle.disabled = true;
  actualizarSeleccion();
}

mapaInformar.on("click", e => {
  if (form.dataset.modo === "punto") ponerPunto(e.latlng);
  else if (form.dataset.modo === "calle" && mapaInformar.getZoom() < ZOOM_SELECCION) {
    mapaInformar.setView(e.latlng, ZOOM_SELECCION + 1);
  }
});

form.addEventListener("change", e => {
  if (e.target.name === "tipo") cambiarTipo();
});

buscar.addEventListener("input", () => {
  const ids = porNombre[buscar.value];
  todaCalle.disabled = !ids;
  if (ids) mapaInformar.fitBounds(L.latLngBounds(ids.flatMap(latlngs)), { maxZoom: 18, padding: [20, 20] });
});

todaCalle.addEventListener("click", () => {
  porNombre[buscar.value].forEach(id => seleccion.add(id));
  actualizarSeleccion();
});

document.getElementById("borrar").addEventListener("click", () => {
  seleccion.clear();
  quitarPunto();
  actualizarSeleccion();
});

document.getElementById("mi-ubicacion").addEventListener("click", () => {
  if (!navigator.geolocation) return actualizarSeleccion("Tu navegador no permite obtener la ubicación.");
  actualizarSeleccion("Buscando tu ubicación…");
  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      if (!L.latLngBounds(LIMITES).contains(ll)) return actualizarSeleccion("Tu ubicación está fuera de la zona del mapa.");
      mapaInformar.setView(ll, 17);
      ponerPunto(ll);
    },
    () => actualizarSeleccion("No se ha podido obtener tu ubicación. Toca el sitio en el mapa."),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  const tipo = form.elements.tipo.value;
  const error =
    !tipo ? "Elige qué vas a reportar." :
    tipo === "panfletos" && !marcador ? "Marca en el mapa dónde se repartieron los panfletos." :
    tipo !== "panfletos" && !seleccion.size ? "Marca en el mapa al menos un tramo de calle." :
    !form.elements.fecha.value ? "Indica la fecha." : "";
  if (error) return avisar(error, "error");

  const datos = {
    tipo,
    fecha: form.elements.fecha.value,
    calles: [...seleccion],
    lat: marcador ? Number(marcador.getLatLng().lat.toFixed(5)) : "",
    lon: marcador ? Number(marcador.getLatLng().lng.toFixed(5)) : "",
    cantidad: form.elements.cantidad.value,
    nota: form.elements.nota.value.trim(),
  };
  if (!URL_APPS_SCRIPT) return avisar("Modo de prueba: el informe no se ha enviado.", "error");

  const boton = document.getElementById("enviar");
  boton.disabled = true;
  avisar("Enviando…", "");
  try {
    // Sin cabecera Content-Type (text/plain) para que Apps Script lo acepte sin petición previa CORS
    const resp = await fetch(URL_APPS_SCRIPT, { method: "POST", body: JSON.stringify(datos) });
    const respuesta = await resp.json();
    if (!respuesta.ok) throw new Error(respuesta.error);
    reiniciarFormulario();
    avisar("¡Gracias! Tu informe se ha enviado.", "ok");
  } catch {
    avisar("No se ha podido enviar. Revisa tu conexión e inténtalo de nuevo.", "error");
  }
  boton.disabled = false;
});

/* ---------- Inicio ---------- */

async function iniciar() {
  // Calles: un fichero por zona (distrito), según la lista de data/zonas.json
  const zonas = await (await fetch("data/zonas.json")).json();
  const ficheros = await Promise.all(zonas.map(async z => (await fetch("data/zonas/" + z.archivo)).json()));
  const geojson = { type: "FeatureCollection", features: ficheros.flatMap(f => f.features) };
  geojson.features.forEach(f => {
    const { id, nombre } = f.properties;
    calles[id] = f;
    (porNombre[nombre] ||= []).push(id);
  });

  const lista = document.getElementById("lista-calles");
  Object.keys(porNombre).sort((a, b) => a.localeCompare(b, "es")).forEach(nombre => {
    const opcion = document.createElement("option");
    opcion.value = nombre;
    lista.append(opcion);
  });

  capaCalles = L.geoJSON(geojson, {
    style: f => estiloTramo(f.properties.id),
    onEachFeature: (f, capa) => capa.on("click", e => tocarTramo(f.properties.id, e)),
  });

  form.elements.fecha.value = hoy();
  form.elements.fecha.max = hoy();
  document.querySelectorAll("input[name=capa], #periodo").forEach(el => el.addEventListener("change", dibujarInformes));
  window.addEventListener("hashchange", mostrarVista);
  mostrarVista();
}

iniciar();
