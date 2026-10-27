# Guarda calles como ficheros de zona: un GeoJSON por cada valor de una columna (p. ej. distrito)
# en data/zonas/, y los añade a data/zonas.json, que es la lista de zonas que carga la web.
# Nunca sobrescribe una zona existente ni repite tramos que ya estén en otra zona: los informes
# guardan ids de tramos, y así los informes antiguos siguen apareciendo en el mapa.
# Uso: Rscript scripts/guardar_zonas.R <calles.geojson> [columna]   (columna por defecto: distrito)
# El GeoJSON de entrada necesita las columnas id y nombre (ver extraer_sevilla.R).

library(sf)

args <- commandArgs(trailingOnly = TRUE)
calles <- st_read(args[1], quiet = TRUE)
columna <- if (length(args) > 1) args[2] else "distrito"

carpeta <- "data/zonas"
lista <- "data/zonas.json"
dir.create(carpeta, showWarnings = FALSE, recursive = TRUE)
zonas <- if (file.exists(lista)) jsonlite::fromJSON(lista) else data.frame(archivo = character(), nombre = character())

# Tramos que ya están en alguna zona
existentes <- unlist(lapply(file.path(carpeta, zonas$archivo), function(f) st_read(f, quiet = TRUE)$id))
calles <- calles[!calles$id %in% existentes & !is.na(calles[[columna]]), ]

nombre_archivo <- function(x) {
  x <- chartr("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN", tolower(x))
  paste0(gsub("^_|_$", "", gsub("[^a-z0-9]+", "_", x)), ".geojson")
}

for (zona in sort(unique(calles[[columna]]))) {
  titulo <- sub("^Distrito ", "", zona)
  archivo <- nombre_archivo(titulo)
  ruta <- file.path(carpeta, archivo)
  if (file.exists(ruta)) {
    cat("Ya existe, no se toca:", archivo, "\n")
    next
  }
  tramos <- calles[calles[[columna]] == zona, c("id", "nombre")]
  st_write(tramos, ruta, layer_options = c("COORDINATE_PRECISION=5", "RFC7946=YES"), quiet = TRUE)
  zonas <- rbind(zonas, data.frame(archivo = archivo, nombre = titulo))
  cat(archivo, ":", nrow(tramos), "tramos,", round(file.size(ruta) / 1e6, 2), "MB\n")
}

jsonlite::write_json(zonas, lista, pretty = TRUE)
