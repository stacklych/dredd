{before, after, log} = require 'hooks'

before "/machines > Get Machines > 200 > application/json; charset=utf-8", (transaction) ->
  log {err: 'Error object!'}
  log true

after "/machines > Get Machines > 200 > application/json; charset=utf-8", (transaction) ->
  log "using hooks.log to debug"
