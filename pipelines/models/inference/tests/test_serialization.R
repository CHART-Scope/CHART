#!/usr/bin/env Rscript

suppressMessages({
  library(jsonlite)
  library(plumber)
})

script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) == 1) {
    return(normalizePath(dirname(file_arg), mustWork = TRUE))
  }
  normalizePath(".", mustWork = TRUE)
}

source(file.path(script_dir(), "..", "serialization.R"))

temperatures <- c(
  31.123456789012345,
  30.987654321098765,
  29.24681357913579
)
response <- new.env()
response$setHeader <- function(...) invisible(NULL)
response$toResponse <- function() response$body

serialized <- api_json_serializer()(
  list(tmax_lag = temperatures),
  req = NULL,
  res = response,
  errorHandler = function(req, res, error) stop(error)
)
echoed <- jsonlite::fromJSON(serialized)$tmax_lag

if (!identical(echoed, temperatures)) {
  stop(
    "LBW JSON serializer changed temperature inputs: ",
    paste(echoed, collapse = ", ")
  )
}

message("LBW JSON serializer preserves exact temperature inputs.")
