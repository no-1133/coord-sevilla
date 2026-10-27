/** @OnlyCurrentDoc */  // el script solo puede acceder a esta hoja de cálculo, no al resto del Drive

// Recibe los informes de la web y los guarda en una hoja de cálculo de Google.
//
// Puesta en marcha:
//  1. Crear una hoja de cálculo nueva en Google Drive (con la cuenta del colectivo).
//  2. Extensiones > Apps Script, pegar este archivo y guardar.
//  3. Implementar > Nueva implementación > Tipo: Aplicación web.
//     Ejecutar como: yo. Quién tiene acceso: cualquier usuario.
//  4. Copiar la URL de la aplicación web en config.js (URL_APPS_SCRIPT).
// Para moderar, basta con borrar la fila del informe en la hoja.

const HOJA = "Informes";
const RETRASO_MS = 2 * 60 * 1000;  // los informes se muestran 2 minutos después de enviarse
const TIPOS = ["carteles", "buzoneo", "panfletos"];
const CABECERAS = ["enviado", "tipo", "fecha", "calles", "lat", "lon", "cantidad", "nota"];

function hoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(HOJA);
  if (!h) {
    h = libro.insertSheet(HOJA);
    h.getRange("A:H").setNumberFormat("@");  // todo como texto, sin conversiones automáticas
    h.appendRow(CABECERAS);
  }
  return h;
}

function respuesta(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const limite = Date.now() - RETRASO_MS;
  const informes = hoja().getDataRange().getValues().slice(1)
    .filter(f => new Date(f[0]).getTime() <= limite)
    .map(f => ({
      tipo: f[1],
      fecha: f[2] instanceof Date ? Utilities.formatDate(f[2], "Europe/Madrid", "yyyy-MM-dd") : String(f[2]),
      calles: String(f[3]),
      lat: f[4], lon: f[5], cantidad: f[6], nota: f[7],
    }));
  return respuesta(informes);
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const esPunto = d.tipo === "panfletos";
    const calles = Array.isArray(d.calles) ? d.calles.map(String) : [];

    if (!TIPOS.includes(d.tipo)) throw new Error("tipo");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new Error("fecha");
    if (esPunto && !(d.lat > 37.29 && d.lat < 37.47 && d.lon > -6.06 && d.lon < -5.80)) throw new Error("lugar");
    if (!esPunto && (!calles.length || calles.length > 200 || !calles.every(c => /^\d+$/.test(c)))) throw new Error("calles");

    const cantidad = parseInt(d.cantidad, 10);
    // Una nota que empiece por = + - @ se tomaría como fórmula
    const nota = String(d.nota || "").slice(0, 200).replace(/^[=+\-@]/, "'$&");

    hoja().appendRow([
      new Date().toISOString(),
      d.tipo,
      d.fecha,
      esPunto ? "" : calles.join(" "),
      esPunto ? Number(d.lat) : "",
      esPunto ? Number(d.lon) : "",
      cantidad > 0 && cantidad <= 100000 ? cantidad : "",
      nota,
    ]);
    return respuesta({ ok: true });
  } catch (err) {
    return respuesta({ ok: false, error: String(err.message || err) });
  }
}
