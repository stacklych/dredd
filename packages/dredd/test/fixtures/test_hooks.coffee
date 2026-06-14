{after} = require 'hooks'

after "/machines > Get Machines > 200 > application/json; charset=utf-8", (transaction) ->
  console.log "after"
