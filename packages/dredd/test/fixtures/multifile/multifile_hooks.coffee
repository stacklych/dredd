{after} = require 'hooks'

after "Name API > /name > GET > 200 > text/plain; charset=utf-8", (transaction) ->
  console.log "after name"

after "Greeting API > /greeting > GET > 200 > text/plain; charset=utf-8", (transaction) ->
  console.log "after greeting"

after "Message API > /message > GET > 200 > text/plain; charset=utf-8", (transaction) ->
  console.log "after message"
