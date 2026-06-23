.. include:: _links.rst
.. _data-structures:

Data Structures
===============

Documentation of various data structures used by Dredd. `MSON`_ notation is used to describe the data structures.

.. _transaction:

Transaction (object)
--------------------

Transaction object is passed as a first argument to :ref:`hook functions <hooks>` and is one of the main public interfaces in Dredd.

-  id: ``GET (200) /greetings`` - identifier for this transaction
-  name: ``My API > /greetings > Retrieve Message > 200 > application/json`` (string) - reference to the transaction definition in the original API description document (see also `Dredd Transactions <https://github.com/apiaryio/dredd-transactions#user-content-data-structures>`__)
-  origin (object) - reference to the transaction definition in the original API description document (see also `Dredd Transactions <https://github.com/apiaryio/dredd-transactions#user-content-data-structures>`__)

   -  filename: ``api-description.yaml`` (string)
   -  apiName: ``My API`` (string)
   -  resourceGroupName: ``''`` (string) - empty for OpenAPI 3, which has no resource groups
   -  resourceName: ``/greetings`` (string) - the path of the operation
   -  actionName: ``Retrieve Message`` (string) - the operation ``summary`` (or the HTTP method when there is none)
   -  exampleName: ``200 > application/json`` (string) - the response status code and media type

-  host: ``127.0.0.1`` (string) - server hostname without port number
-  port: ``3000`` (number) - server port number
-  protocol: ``https:`` (enum[string]) - server protocol

   -  ``https:`` (string)
   -  ``http:`` (string)

-  fullPath: ``/message`` (string) - expanded :rfc:`URI Template <6570>` with parameters (if any) used for the HTTP request Dredd performs to the tested server
-  request (object) - the HTTP request Dredd performs to the tested server, taken from the API description

   -  body: ``Hello world!\n`` (string)
   -  bodyEncoding (enum) - can be manually set in :ref:`hooks <hooks>`

      -  ``utf-8`` (string) - indicates ``body`` contains a textual content encoded in UTF-8
      -  ``base64`` (string) - indicates ``body`` contains a binary content encoded in Base64

   -  headers (object) - keys are HTTP header names, values are HTTP header contents
   -  uri: ``/message`` (string) - request URI as it was written in API description
   -  method: ``POST`` (string)

-  expected (object) - the HTTP response Dredd expects to get from the tested server

   -  statusCode: ``200`` (string)
   -  headers (object) - keys are HTTP header names, values are HTTP header contents
   -  body (string)
   -  bodySchema (object) - JSON Schema of the response body

-  real (object) - the HTTP response Dredd gets from the tested server (present only in ``after`` hooks)

   -  statusCode: ``200`` (string)
   -  headers (object) - keys are HTTP header names, values are HTTP header contents
   -  body (string)
   -  bodyEncoding (enum)

      -  ``utf-8`` (string) - indicates ``body`` contains a textual content encoded in UTF-8
      -  ``base64`` (string) - indicates ``body`` contains a binary content encoded in Base64

-  skip: ``false`` (boolean) - can be set to ``true`` and the transaction will be skipped
-  fail: ``false`` (enum) - can be set to ``true`` or string and the transaction will fail

   -  (string) - failure message with details why the transaction failed
   -  (boolean)

-  test (:ref:`transaction-test`) - test data passed to Dredd’s reporters
-  errors (:ref:`test-runtime-error`) - Transaction runtime errors
-  results (:ref:`transaction-results`) - testing results

.. _transaction-test:

Transaction Test (object)
-------------------------

-  start (Date) - start of the test
-  end (Date) - end of the test
-  duration (number) - duration of the test in milliseconds
-  startedAt (number) - unix timestamp, :ref:`transaction <transaction>`.startedAt
-  title (string) - :ref:`transaction <transaction>`.id
-  request (object) - :ref:`transaction <transaction>`.request
-  actual (object) - :ref:`transaction <transaction>`.real
-  expected (object) - :ref:`transaction <transaction>`.expected
-  status (enum) - whether the validation passed or not, defaults to empty string

   -  ``pass`` (string)
   -  ``fail`` (string)
   -  ``skip`` (string)

-  message (string) - concatenation of all messages from all :ref:`gavel-error` in ``results`` or Dredd’s custom message (e.g. “failed in before hook”)
-  results (Dredd’s :ref:`transaction <transaction>`.results)
-  valid (boolean)
-  origin (object) - :ref:`transaction <transaction>`.origin

.. _transaction-results:

Transaction Results (object)
----------------------------

Transaction result is produced by Dredd’s built-in response validator.

-  valid (boolean) - Indicates whether the transaction is valid.
-  fields (object)
   -  *uri* - :ref:`gavel-validation-result-field`
   -  *method* - :ref:`gavel-validation-result-field`
   -  *statusCode* - :ref:`gavel-validation-result-field`
   -  *headers* - :ref:`gavel-validation-result-field`
   -  *body* - :ref:`gavel-validation-result-field`

.. _gavel-validator-output:
.. _gavel-validation-result-field:

Validation Result Field (object)
--------------------------------

-  valid (boolean) - Whether the HTTP message field is valid
-  kind (enum[string], nullable) - The validation kind applied to the expected/actual data (how the values were compared)
   -  json
   -  text
-  values (object)

   -  expected (any) - Expected value of the HTTP message field
   -  actual (any) - Actual value of the HTTP message field

- errors (array[:ref:`gavel-error`])

.. _gavel-error:

Validation Error (object)
-------------------------

-  message (string) - Error message
-  location (object, optional) - Kind-dependent extra error information

   -  pointer (string) - :rfc:`JSON Pointer <6901>` path
   -  property (array[string]) - A deep property path

.. _test-runtime-error:

Test Runtime Error (object)
---------------------------

Whenever an exception occurs during a test run it's being recorded under the ``errors`` property of the test.

Test run error has the following structure:

-  message (string) - Error message.
-  severity (enum[string]) - Severity of the occurred error
   -  warning
   -  error
