# Extrae de un fichero .osm.pbf (p. ej. andalucia-latest.osm.pbf de download.geofabrik.de)
# las calles con nombre del municipio de Sevilla y los límites de municipio, distritos y barrios.
# Datos (c) OpenStreetMap contributors, ODbL.
# Uso: Rscript scripts/extraer_sevilla.R <fichero.osm.pbf> <carpeta de salida>

library(sf)

args <- commandArgs(trailingOnly = TRUE)
pbf <- args[1]
salida <- args[2]
dir.create(salida, showWarnings = FALSE, recursive = TRUE)

caja <- "POLYGON((-6.05 37.29, -5.80 37.29, -5.80 37.47, -6.05 37.47, -6.05 37.29))"

# Calles donde tiene sentido dejar carteles o buzonear (igual que descargar_calles.R)
tipos <- c("primary", "secondary", "tertiary", "unclassified", "residential",
           "living_street", "pedestrian")

# Límites: distritos (9) y barrios (10). El polígono del municipio no viene en el extracto
# (geometría rota en OSM), así que el municipio es la unión de sus 11 distritos.
limites <- st_read(pbf, quiet = TRUE, wkt_filter = caja, query =
  "SELECT osm_id, name, admin_level FROM multipolygons
   WHERE boundary = 'administrative' AND admin_level IN ('9', '10')")
limites <- st_make_valid(limites)
stopifnot(sum(limites$admin_level == "9") == 11)
municipio <- st_union(limites[limites$admin_level == "9", ])
dentro <- st_within(st_point_on_surface(limites), municipio, sparse = FALSE)[, 1]
limites <- limites[dentro, ]
limites$nivel <- c("9" = "distrito", "10" = "barrio")[limites$admin_level]
names(limites)[names(limites) == "name"] <- "nombre"

# Calles con nombre dentro del municipio
calles <- st_read(pbf, quiet = TRUE, wkt_filter = caja, query = paste0(
  "SELECT osm_id, name, highway FROM lines WHERE name IS NOT NULL AND highway IN ('",
  paste(tipos, collapse = "', '"), "')"))
calles <- st_filter(calles, municipio)
calles <- calles[, c("osm_id", "name")]
names(calles)[1:2] <- c("id", "nombre")

# Distrito y barrio de cada tramo (según un punto sobre la línea)
punto <- st_point_on_surface(calles)
for (nivel in c("distrito", "barrio")) {
  zonas <- limites[limites$nivel == nivel, ]
  i <- st_intersects(punto, zonas)
  calles[[nivel]] <- vapply(i, function(k) if (length(k)) zonas$nombre[k[1]] else NA_character_, "")
}
# Tramos en el borde, fuera de todo distrito: al distrito más cercano
sin <- is.na(calles$distrito)
distritos <- limites[limites$nivel == "distrito", ]
calles$distrito[sin] <- distritos$nombre[st_nearest_feature(punto[sin, ], distritos)]

escribir <- function(x, fichero) {
  ruta <- file.path(salida, fichero)
  if (file.exists(ruta)) file.remove(ruta)
  st_write(x, ruta, layer_options = c("COORDINATE_PRECISION=5", "RFC7946=YES"), quiet = TRUE)
  cat(fichero, ":", nrow(x), "elementos,", round(file.size(ruta) / 1e6, 2), "MB\n")
}
escribir(calles, "sevilla_calles.geojson")
escribir(limites[, c("osm_id", "nombre", "nivel")], "sevilla_limites.geojson")

cat("\nTramos por distrito:\n")
print(sort(table(calles$distrito, useNA = "ifany"), decreasing = TRUE))
cat("\nBarrios:", sum(limites$nivel == "barrio"), "\n")
