.. include:: _links.rst
.. _how-it-works:

How It Works
============

In a nutshell, Dredd does following:

1. Takes your API description document,
2. creates expectations based on requests and responses documented in the document,
3. makes requests to tested API,
4. checks whether API responses match the documented responses,
5. reports the results.

Versioning
----------

Dredd follows `Semantic Versioning <https://semver.org/>`__. To ensure certain stability of your Dredd installation (e.g. in CI), pin the version accordingly:

-  ``npm install @stacklych/dredd`` - Installs the latest published version.
-  ``npm install @stacklych/dredd@x.y.z`` - Pins a specific version. Recommended for CI installations.

If the ``User-Agent`` header isn’t overridden in the API description document, Dredd uses it for sending information about its version number along with every HTTP request it does.

.. _execution-life-cycle:

Execution Life Cycle
--------------------

Following execution life cycle documentation should help you to understand how Dredd works internally and which action goes after which.

1. Load and parse API description documents

   -  Report parse errors and warnings

2. Pre-run API description check

   -  Missing example values for URI template parameters
   -  Required parameters present in URI
   -  Report non-parseable JSON bodies
   -  Report invalid URI parameters
   -  Report invalid URI templates

3. Compile HTTP transactions from API description documents

   -  Inherit headers
   -  Inherit parameters
   -  Expand URI templates with parameters

4. Load :ref:`hooks <hooks>`
5. Test run

   -  Report test run ``start``
   -  Run ``beforeAll`` hooks
   -  For each compiled transaction:

      -  Report ``test start``
      -  Run ``beforeEach`` hook
      -  Run ``before`` hook
      -  Send HTTP request
      -  Receive HTTP response
      -  Run ``beforeEachValidation`` hook
      -  Run ``beforeValidation`` hook
      -  :ref:`Perform validation <automatic-expectations>`
      -  Run ``after`` hook
      -  Run ``afterEach`` hook
      -  Report ``test end`` with result for in-progress reporting

   -  Run ``afterAll`` hooks

6. Report test run ``end`` with result statistics

.. _automatic-expectations:

Automatic Expectations
----------------------

Dredd automatically generates expectations on HTTP responses based on examples and schemas in the API description. Structural expectations are validated by Dredd’s built-in validator. In addition, **OpenAPI 3.0, 3.1, and 3.2 response schemas are validated with Ajv**, so response data types — including ``$ref``, ``allOf``, arrays, ``nullable``, and string formats — are checked against the described schema.

Response Headers Expectations
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  All headers the API description marks as required (``required: true``) must be present in the response. Optional headers, which is the OpenAPI default, are not checked.
-  Names of headers are validated in the case-insensitive way.
-  Only values of headers significant for content negotiation are validated.
-  All other headers values can differ.

In OpenAPI 3 documents, Dredd takes the response ``Content-Type`` from the selected response ``content`` media type. Expected response headers are taken from the required entries of the response ``headers`` object.

Response Body Expectations
~~~~~~~~~~~~~~~~~~~~~~~~~~

If the HTTP response body is JSON, Dredd validates only its structure. Bodies in any other format are validated as plain text. A response ``schema`` is used only for JSON media types (``application/json`` and ``+json`` types); a schema on any other media type, such as ``text/plain`` or ``application/xml``, is ignored.

To validate the structure Dredd uses `JSON Schema`_ inferred from the API description under test. The effective JSON Schema is taken from following places (the order goes from the highest priority to the lowest):

OpenAPI 3.0
^^^^^^^^^^^

1. Response ``content`` media type ``schema`` - the Schema Object is converted to JSON Schema (for example ``nullable: true`` becomes a type union with ``"null"``, and boolean ``exclusiveMinimum``/``exclusiveMaximum`` are normalized) and validated with Ajv, the same way as OpenAPI 3.1.
2. Response ``content`` media type ``example`` or first ``examples`` entry - Dredd uses the sample payload as the expected body.

OpenAPI 3.1
^^^^^^^^^^^

1. Response ``content`` media type ``schema`` - provided Schema Object will be used.
2. Response ``content`` media type ``example`` or first ``examples`` entry - Dredd uses the sample payload as the expected body.
3. If no explicit response example is present, Dredd generates a sample body from the schema using the following precedence: ``example``, ``default``, ``const``, first ``enum`` value, first ``oneOf`` schema, first ``anyOf`` schema, then a generated value by type.

OpenAPI 3.1 and 3.2 schemas are emitted with an explicit ``$schema`` before validation (3.2 reuses the OpenAPI 3.1 Schema Object dialect). Dredd preserves a schema-level ``$schema``. If the schema does not define one, Dredd uses the root ``jsonSchemaDialect`` value. If neither is present, Dredd uses the `OpenAPI 3.1 Schema Object dialect`_ URI. The OpenAPI 3.1 Schema Object dialect and ``https://json-schema.org/draft/2020-12/schema`` are validated with Ajv's JSON Schema 2020-12 validator, and ``https://json-schema.org/draft/2019-09/schema`` with its 2019-09 validator (a trailing ``#`` on these URIs is accepted). ``http://json-schema.org/draft-07/schema#`` uses the default validator. Any other dialect fails the test with a message naming the dialect. Keywords next to a ``$ref`` apply together with the referenced schema, as JSON Schema 2020-12 requires; in OpenAPI 3.0 documents they are ignored, as OpenAPI 3.0 requires.

.. _gavels-expectations:

Structural Expectations
^^^^^^^^^^^^^^^^^^^^^^^

-  All JSON keys on any level given in the sample must be present in the response’s JSON.
-  Response’s JSON values must be of the same JSON primitive type.
-  All JSON values can differ.
-  Arrays can have additional items, type or structure of the items is not validated.
-  Plain text must match perfectly.

Custom Expectations
~~~~~~~~~~~~~~~~~~~

You can make your own custom expectations in :ref:`hooks <hooks>`. For instance, check out how to employ :ref:`Chai.js assertions <using-chai-assertions>`.

Making Your API Description Ready for Testing
---------------------------------------------

It’s very likely that your API description document will not be testable **as is**. This section should help you to learn how to solve the most common issues.

URI Parameters
~~~~~~~~~~~~~~

`OpenAPI 3`_ allows usage of URI templates. In order to have an API description which is testable, you need to describe all required parameters used in URI (path or query) and provide sample values to make Dredd able to expand URI templates with given sample values. Following rules apply when Dredd interpolates variables in a templated URI, ordered by precedence:

1. Sample value, available as ``example`` or the first ``examples`` entry.
2. Value of ``default``.
3. First value from ``enum``.

If Dredd isn’t able to infer any value for a required parameter, it will terminate the test run and complain that the parameter is *ambiguous*.

In OpenAPI 3 documents, path parameters are serialized with ``style: simple`` and query parameters are serialized with ``style: form``. Arrays and objects support OpenAPI's default ``explode`` values and explicit ``explode: true`` or ``explode: false``. OpenAPI 3.2 ``in: querystring`` parameters are also supported: the whole query string is taken from the parameter's ``content`` (an object is form-encoded, or an example ``serializedValue`` is used verbatim). Other parameter locations and styles are not covered yet.

Request Headers
~~~~~~~~~~~~~~~

In OpenAPI 3 documents, Dredd takes the request ``Content-Type`` from the selected request body ``content`` media type.


Request Body
~~~~~~~~~~~~

The effective request body is inferred from the operation ``requestBody`` content. Each media type entry produces its own request (see :ref:`choosing-http-transactions`). If the media type defines ``example`` or ``examples``, Dredd uses the explicit example. If no example is present, Dredd generates a sample value from the schema using the following precedence: ``example``, ``default``, ``const``, first ``enum`` value, first ``oneOf`` schema, first ``anyOf`` schema, then a generated value by type. In OpenAPI 3.1 and 3.2 documents, an object value is form-encoded for ``application/x-www-form-urlencoded``; for other non-JSON media types (such as ``multipart/form-data``) an object value produces no body.

.. _empty-response-body:

Empty Response Body
~~~~~~~~~~~~~~~~~~~

If there is no body example or schema specified for the response in your API description document, Dredd won’t imply any assertions. Any server response will be considered as valid.

If you want to enforce the incoming body is empty, you can use :ref:`hooks <hooks>`:

.. literalinclude:: ../packages/dredd/test/fixtures/response/empty-body-hooks.js
   :language: javascript

In case of responses with 204 or 205 status codes Dredd still behaves the same way, but it warns about violating the :rfc:`7231` when the responses have non-empty bodies.

.. _choosing-http-transactions:

Choosing HTTP Transactions
--------------------------

The OpenAPI 3 compiler produces one transaction for each combination of request body media type and response media type of an operation: an operation with two request media types and a response with two media types produces four transactions. A response without content produces one transaction per request media type. Each request carries an ``Accept`` header naming the expected response media type, unless the operation defines an ``Accept`` header parameter. For ``default`` responses, Dredd currently uses HTTP 200 as the compiled expected status. Response status code ranges (``2XX`` and similar) are reported with a warning and produce no transaction.

Current OpenAPI 3 support is focused on response testing. It supports path and query parameter examples, path ``simple`` and query ``form`` parameter serialization, request body examples, response body examples, simple local ``$ref`` values, schema-derived JSON/text samples, and response schema validation for the OpenAPI 3.1 Schema Object dialect and JSON Schema 2020-12. OpenAPI 3.2 documents are compiled through the same path: the ``query`` (QUERY) method and the ``additionalOperations`` map produce transactions, and ``in: querystring`` parameters and example ``serializedValue`` are honoured. Streaming and sequential media (a media type carrying ``itemSchema``, or Server-Sent Events via ``text/event-stream``) is reported with a warning and is not validated as a stream. It does not yet implement all OpenAPI 3.1 features such as external references, callbacks, links, webhooks, header or cookie parameters, matrix, label, space-delimited, pipe-delimited, or deep-object parameter serialization, or multipart encoding objects.

.. _security:

Security
--------

Depending on what you test and how, output of Dredd may contain sensitive data.

Dredd replaces the values of credential headers with ``[REDACTED]`` in its CLI output, in all reporters and in the debug configuration dump. This covers ``Authorization`` (including the header :option:`--user` creates), ``Proxy-Authorization``, ``Cookie`` and ``Set-Cookie``, and headers whose name contains ``auth``, ``token``, ``secret``, ``api-key``/``apikey``, ``password`` or ``session`` as a word (e.g. ``X-API-Key``, ``X-Auth-Token``), including headers added with :option:`--header`. The requests Dredd sends keep the real values. Credentials elsewhere, such as in request or response bodies or in URLs, are not redacted.

Mind that if you run Dredd in a CI server provided as a service (such as `CircleCI`_, `Travis CI`_, etc.), you are disclosing the CLI output of Dredd to third parties.

If you save test reports with a file-based reporter (e.g. :option:`--reporter` ``html`` or ``json``), those reports can contain details of all requests made to the server under test and their responses. You can :ref:`sanitize them before they get written <removing-sensitive-data-from-test-reports>`.

.. _using-http-s-proxy:
.. _using-https-proxy:

Using HTTP(S) Proxy
-------------------

You can tell Dredd to use HTTP(S) proxy for:

-  downloading API description documents (the positional argument :option:`api-description-document` or the :option:`--path` option accepts also URL)

Dredd respects ``HTTP_PROXY``, ``HTTPS_PROXY``, ``NO_PROXY``, ``http_proxy``, ``https_proxy``, and ``no_proxy`` environment variables. For more information on how those work see `relevant section <https://github.com/request/request#user-content-proxies>`__ of the underlying library’s documentation.

Dredd intentionally **does not support HTTP(S) proxies for testing**. Proxy can deliberately modify requests and responses or to behave in a very different way then the server under test. Testing over a proxy is, in the first place, testing of the proxy itself. That makes the test results irrelevant (and hard to debug).
