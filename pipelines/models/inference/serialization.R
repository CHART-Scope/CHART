# JSON serialization is part of the inference integrity contract. Fifteen
# decimal places preserve an IEEE-754 temperature value across an R/JSON/Python
# round trip while keeping scalar values unboxed.
api_json_serializer <- function() {
  plumber::serializer_unboxed_json(digits = 15)
}
