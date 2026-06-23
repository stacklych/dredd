.. include:: _links.rst
.. _how-to-guides:

How-To Guides
=============

In the following guides you can find tips and best practices how to cope with some common tasks. While searching this page for particular keywords can give you quick results, reading the whole section should help you to learn some of the Dredd’s core concepts and usual ways how to approach problems when testing with Dredd.

Isolation of HTTP Transactions
------------------------------

Requests in the API description usually aren’t sorted in order to comply with logical workflow of the tested application. To get the best results from testing with Dredd, you should ensure each operation is executed in isolated context. This can be easily achieved using :ref:`hooks <hooks>`, where you can provide your own setup and teardown code for each HTTP transaction.

You should understand that testing with Dredd is an analogy to **unit tests** of your application code. In unit tests, each unit should be testable without any dependency on other units or previous tests.

Example
~~~~~~~

Common case is to solve a situation where we want to test deleting of a resource. Obviously, to test deleting of a resource, we first need to create one. However, the order of HTTP transactions can be pretty much random in the API description.

To solve the situation, it’s recommended to isolate the deletion test by :ref:`hooks <hooks>`. Providing ``before`` hook, we can ensure the database fixture will be present every time Dredd will try to send the request to delete a category item.

.. code-block:: openapi3

   openapi: "3.0.3"
   info:
     title: Categories API
     version: "1.0"
   paths:
     /categories:
       post:
         summary: Create a category
         responses:
           "201":
             description: Created
             content:
               application/json:
                 example:
                   id: "42"
     /category/{id}:
       delete:
         summary: Delete a category
         parameters:
           - name: id
             in: path
             required: true
             schema:
               type: string
             example: "42"
         responses:
           "204":
             description: No Content
     /category/{id}/items:
       post:
         summary: Create an item
         parameters:
           - name: id
             in: path
             required: true
             schema:
               type: string
             example: "42"
         responses:
           "201":
             description: Created
             content:
               application/json:
                 example:
                   id: "1"

To have an idea where we can hook our arbitrary code, we should first ask Dredd to list all available transaction names:

::

   $ dredd api-description.yaml http://127.0.0.1:3000 --names
   info: /categories > Create a category > 201 > application/json
   info: /category/{id} > Delete a category > 204
   info: /category/{id}/items > Create an item > 201 > application/json

Now we can create a ``hooks.js`` file. The file will contain setup and teardown of the database fixture:

.. code-block:: javascript

   hooks = require('hooks');
   db = require('./lib/db');

   beforeAll(function() {
     db.cleanUp();
   });

   afterEach(function(transaction) {
     db.cleanUp();
   });

   before('/category/{id} > Delete a category > 204', function() {
     db.createCategory({id: 42});
   });

   before('/category/{id}/items > Create an item > 201 > application/json', function() {
     db.createCategory({id: 42});
   });

Testing API Workflows
---------------------

Often you want to test a sequence of steps, a scenario, rather than just one request-response pair in isolation. Since the API description formats are quite limited in their support of documenting scenarios, Dredd probably isn’t the best tool to provide you with this kind of testing. There are some tricks though, which can help you to work around some of the limitations.

To test various scenarios, you will want to write each of them into a separate API description document. To load them during a single test run, use the :option:`--path` option.

For workflows to work properly, you’ll also need to keep **shared context** between individual HTTP transactions. You can use :ref:`hooks <hooks>` in order to achieve that. See tips on how to :ref:`pass data between transactions <sharing-data-between-steps-in-request-stash>`.

Example
~~~~~~~

Imagine we have a simple workflow described:

.. code-block:: openapi3

   openapi: "3.0.3"
   info:
     title: My Scenario
     version: "1.0"
   paths:
     /login:
       post:
         summary: Log in
         requestBody:
           content:
             application/json:
               schema:
                 type: object
                 properties:
                   username:
                     type: string
                   password:
                     type: string
               example:
                 username: john
                 password: d0e
         responses:
           "200":
             description: OK
             content:
               application/json:
                 schema:
                   type: object
                   properties:
                     token:
                       type: string
                 example:
                   token: s3cr3t
     /cars:
       get:
         summary: List cars
         responses:
           "200":
             description: OK
             content:
               application/json:
                 schema:
                   type: array
                   items:
                     type: object
                     properties:
                       id:
                         type: string
                       color:
                         type: string
                 example:
                   - id: "42"
                     color: red
     /cars/{id}:
       patch:
         summary: Update a car
         parameters:
           - name: id
             in: path
             required: true
             schema:
               type: string
             example: "42"
         requestBody:
           content:
             application/json:
               schema:
                 type: object
                 properties:
                   color:
                     type: string
               example:
                 color: yellow
         responses:
           "200":
             description: OK
             content:
               application/json:
                 schema:
                   type: object
                   properties:
                     id:
                       type: string
                     color:
                       type: string
                 example:
                   id: "42"
                   color: yellow

Writing Hooks
^^^^^^^^^^^^^

To have an idea where we can hook our arbitrary code, we should first ask Dredd to list all available transaction names:

::

   $ dredd api-description.yaml http://127.0.0.1:3000 --names
   info: /login > Log in > 200 > application/json
   info: /cars > List cars > 200 > application/json
   info: /cars/{id} > Update a car > 200 > application/json

Now we can create a ``hooks.js`` file. The code of the file will use global ``stash`` variable to share data between requests:

.. code-block:: javascript

   hooks = require('hooks');
   db = require('./lib/db');

   stash = {}

   // Stash the token we've got
   after('/login > Log in > 200 > application/json', function (transaction) {
     stash.token = JSON.parse(transaction.real.body).token;
   });

   // Add the token to all HTTP transactions
   beforeEach(function (transaction) {
     if (stash.token) {
       transaction.request.headers['X-Api-Key'] = stash.token
     };
   });

   // Stash the car ID we've got
   after('/cars > List cars > 200 > application/json', function (transaction) {
     stash.carId = JSON.parse(transaction.real.body).id;
   });

   // Replace car ID in request with the one we've stashed
   before('/cars/{id} > Update a car > 200 > application/json', function (transaction) {
     transaction.fullPath = transaction.fullPath.replace('42', stash.carId)
     transaction.request.uri = transaction.fullPath
   })

Making Dredd Validation Stricter
--------------------------------

OpenAPI 3 documents are usually created primarily with *documentation* in mind. But what’s enough for documentation doesn’t need to be enough for *testing*. Dredd validates JSON response bodies against the `JSON Schema`_ derived from your ``schema`` objects, so the stricter the schema, the stricter the test.

In following sections you can learn about how to deal with common scenarios.

Avoiding Additional Properties
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you describe a JSON body which has attributes ``name`` and ``size``, the following payload will be considered as correct:

.. code-block:: json

   {"name": "Sparta", "size": 300, "luck": false}

It’s because in `JSON Schema`_ additional properties are not forbidden by default. Set ``additionalProperties: false`` on the object schema to reject unknown properties.

Requiring Properties
~~~~~~~~~~~~~~~~~~~~

If you describe a JSON body which has attributes ``name`` and ``size``, the following payload will be considered as correct:

.. code-block:: json

   {"name": "Sparta"}

It’s because properties are optional by default and you need to explicitly specify them as required. List the mandatory properties under the schema’s ``required`` array.

Validating Structure of Array Items
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you describe an array of items, where each of the items should have a ``name`` property, the following payload will be considered as correct:

.. code-block:: json

   [{"name": "Sparta"}, {"title": "Athens"}, "Thebes"]

That’s because an unconstrained array accepts items of any structure. Constrain the array with an ``items`` schema and make that item schema strict (for example ``additionalProperties: false`` plus a ``required`` list) so every element must match the described structure.

Validating Specific Values
~~~~~~~~~~~~~~~~~~~~~~~~~~

If you describe a JSON body which has attributes ``name`` and ``size``, the following payload will be considered as correct:

.. code-block:: json

   {"name": "Sparta", "size": 42}

If the size should be always equal to 300, you need to specify the fact in your API description. Use ``enum`` with one or more allowed values, or ``const`` for a single fixed value.

Integrating Dredd with Your Test Suite
--------------------------------------

Generally, if you want to add Dredd to your existing test suite, you can just save Dredd configuration in the ``dredd.yml`` file and add call for ``dredd`` command to your task runner.

There are also some packages which make the integration a piece of cake:

-  `grunt-dredd <https://github.com/mfgea/grunt-dredd>`__
-  `dredd-rack <https://github.com/gonzalo-bulnes/dredd-rack>`__
-  `meteor-dredd <https://github.com/storeness/meteor-dredd>`__

To find more, search for ``dredd`` in your favorite language’s package index.

.. _continuous-integration:

Continuous Integration
----------------------

It’s a good practice to make Dredd part of your continuous integration workflow. Only that way you can ensure that application code you’ll produce won’t break the contract you provide in your API documentation.

Dredd’s interactive configuration wizard, ``dredd init``, can help you with setting up ``dredd.yml`` configuration file and with modifying or generating CI configuration files for `Travis CI`_ or `CircleCI`_.

If you prefer to add Dredd yourself or you look for inspiration on how to add Dredd to other continuous integration services, see examples below. When testing in CI, always pin your Dredd version to a specific number and upgrade to newer releases manually.

.. _circleyml-configuration-file-for-circleci:

``.circleci/config.yml`` Configuration File for `CircleCI`_
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

::

   version: 2
   jobs:
     build:
       docker:
         - image: circleci/node:latest
       steps:
         - checkout
         - run: npm install dredd@x.x.x --global
         - run: dredd api-description.yaml http://127.0.0.1:3000

.. _travisyml-configuration-file-for-travis-ci:

``.travis.yml`` Configuration File for `Travis CI`_
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

::

   before_install:
     - npm install dredd@x.x.x --global
   before_script:
     - dredd api-description.yaml http://127.0.0.1:3000

Authenticated APIs
------------------

Dredd supports all common authentication schemes:

-  Basic access authentication
-  Digest access authentication
-  OAuth (any version)
-  CSRF tokens
-  …

Use ``user`` setting in your configuration file or the :option:`--user` option to provide HTTP basic authentication:

::

   --user=user:password

Most of the authentication schemes use HTTP header for carrying the authentication data. If you don’t want to add authentication HTTP header to every request in the API description, you can instruct Dredd to do it for you by the :option:`--header` option:

::

   --header="Authorization: Basic YmVuOnBhc3M="

Sending Multipart Requests
--------------------------

Describe the request body using the ``multipart/form-data`` media type:

.. code-block:: openapi3

   openapi: "3.0.3"
   info:
     title: Multipart example
     version: "1.0"
   paths:
     /data:
       post:
         requestBody:
           content:
             multipart/form-data:
               schema:
                 type: object
                 properties:
                   text:
                     type: string
                   file:
                     type: string
                     format: binary
         responses:
           "200":
             description: OK

Sending Form Data
-----------------

Describe the request body using the ``application/x-www-form-urlencoded`` media type:

.. code-block:: openapi3

   openapi: "3.0.3"
   info:
     title: Form data example
     version: "1.0"
   paths:
     /data:
       post:
         requestBody:
           content:
             application/x-www-form-urlencoded:
               schema:
                 type: object
                 properties:
                   name:
                     type: string
                   email:
                     type: string
         responses:
           "200":
             description: OK

Working with Images and other Binary Bodies
-------------------------------------------

The API description formats generally do not provide a way to describe binary content. The easiest solution is to describe only the media type, to :ref:`leave out the body <empty-response-body>`, and to handle the rest using :ref:`hooks`.

Binary Request Body
~~~~~~~~~~~~~~~~~~~

Describe only the media type and use a ``binary`` string schema:

.. code-block:: openapi3

   openapi: "3.0.3"
   info:
     title: Binary request example
     version: "1.0"
   paths:
     /images:
       post:
         requestBody:
           content:
             image/png:
               schema:
                 type: string
                 format: binary
         responses:
           "200":
             description: OK

Hooks
^^^^^

In hooks, you can populate the request body with real binary data. The data must be in a form of a `Base64-encoded <https://en.wikipedia.org/wiki/Base64>`__ string.

.. literalinclude:: ../packages/dredd/test/fixtures/request/image-png-hooks.js
  :language: javascript

Binary Response Body
~~~~~~~~~~~~~~~~~~~~

Describe only the media type and :ref:`leave out the body <empty-response-body>`, then handle the binary data in :ref:`hooks`:

.. code-block:: openapi3

   openapi: "3.0.3"
   info:
     title: Binary response example
     version: "1.0"
   paths:
     /images/{id}:
       get:
         parameters:
           - name: id
             in: path
             required: true
             schema:
               type: string
         responses:
           "200":
             description: OK
             content:
               image/png: {}

.. note::
   Do not use the explicit ``binary`` or ``bytes`` formats with response bodies, as Dredd is not able to properly work with those (:ghissue:`api-elements.js#269`).

Hooks
~~~~~

In hooks, you can either assert the body:

.. literalinclude:: ../packages/dredd/test/fixtures/response/binary-assert-body-hooks.js
  :language: javascript

Or you can ignore it:

.. literalinclude:: ../packages/dredd/test/fixtures/response/binary-ignore-body-hooks.js
  :language: javascript

.. _multiple-requests-and-responses:

Multiple Requests and Responses
-------------------------------

.. note::
   For details on this topic see also :ref:`How Dredd Works With HTTP Transactions <choosing-http-transactions>`.

In OpenAPI 3, each response of an operation is compiled into its own HTTP transaction:

.. code-block:: openapi3

   openapi: "3.0.3"
   info:
     title: My API
     version: "1.0"
   paths:
     /resource/{id}:
       patch:
         summary: Update Resource
         parameters:
           - name: id
             in: path
             required: true
             schema:
               type: string
             example: "42"
         requestBody:
           content:
             application/json:
               schema:
                 type: object
               example:
                 color: yellow
         responses:
           "200":
             description: OK
             content:
               application/json:
                 example:
                   color: yellow
                   id: 1
           "400":
             description: Bad Request
             content:
               application/json:
                 example:
                   message: Validation failed

Dredd compiles one transaction per response and tests all of them, with these names:

::

   $ dredd api-description.yaml http://127.0.0.1 --names
   info: /resource/{id} > Update Resource > 200 > application/json
   info: /resource/{id} > Update Resource > 400 > application/json

If you don’t want to test a particular response, you can skip it in a :ref:`hook <hooks>`:

.. code-block:: javascript

   var hooks = require('hooks');

   hooks.before('/resource/{id} > Update Resource > 400 > application/json', function (transaction, done) {
     transaction.skip = true;
     done();
   });

In case you need to perform particular request with different URI parameters and standard inheritance of URI parameters isn’t working for you, try :ref:`modifying transaction before its execution <modifying-transaction-request-body-prior-to-execution>` in hooks.

.. _removing-sensitive-data-from-test-reports:

Removing Sensitive Data from Test Reports
-----------------------------------------

Sometimes your API sends back sensitive information you don’t want to get disclosed in your test reports or in your CI log. In that case you can use :ref:`Hooks <hooks>` to do sanitation. Before diving into examples below, do not forget to consider following:

-  Be sure to read :ref:`section about security <security>` first.
-  Only the ``transaction.test`` (:ref:`docs <transaction-test>`) object will make it to reporters. You don’t have to care about sanitation of the rest of the ``transaction`` (:ref:`docs <transaction>`) object.
-  The ``transaction.test.message`` and all the ``transaction.test.results.body.results.rawData.*.message`` properties contain validation error messages. While they’re very useful for learning about what’s wrong on command line, they can contain direct mentions of header names, header values, body properties, body structure, body values, etc., thus it’s recommended their contents are completely removed to prevent unintended leaks of sensitive information.
-  You can use :ref:`Ultimate ‘afterEach’ Guard <sanitation-ultimate-guard>` to make sure you won’t leak any sensitive data by mistake.
-  If your hooks crash, Dredd will send an error to reporters, alongside with current contents of the ``transaction.test`` (:ref:`docs <transaction-test>`) object. See the :ref:`Sanitation of Test Data of Transaction With Secured Erroring Hooks <sanitation-secured-erroring-hooks>` example to learn how to prevent this.

Sanitation of the Entire Request Body
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/entire-request-body.js>`__

Sanitation of the Entire Response Body
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/entire-response-body.js>`__

Sanitation of a Request Body Attribute
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/request-body-attribute.js>`__

Sanitation of a Response Body Attribute
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/response-body-attribute.js>`__

Sanitation of Plain Text Response Body by Pattern Matching
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/plain-text-response-body.js>`__

Sanitation of Request Headers
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/request-headers.js>`__

Sanitation of Response Headers
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/response-headers.js>`__

Sanitation of URI Parameters by Pattern Matching
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/uri-parameters.js>`__

Sanitation of Any Content by Pattern Matching
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/any-content-pattern-matching.js>`__

Sanitation of Test Data of Passing Transaction
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/transaction-passing.js>`__

Sanitation of Test Data When Transaction Is Marked as Failed in 'before' Hook
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/transaction-marked-failed-before.js>`__

Sanitation of Test Data When Transaction Is Marked as Failed in 'after' Hook
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/transaction-marked-failed-after.js>`__

Sanitation of Test Data When Transaction Is Marked as Skipped
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/transaction-marked-skipped.js>`__

.. _sanitation-ultimate-guard:

Ultimate ‘afterEach’ Guard Using Pattern Matching
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can use this guard to make sure you won’t leak any sensitive data by mistake.

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/any-content-guard-pattern-matching.js>`__

.. _sanitation-secured-erroring-hooks:

Sanitation of Test Data of Transaction With Secured Erroring Hooks
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If your hooks crash, Dredd will send an error to reporters, alongside with current contents of the ``transaction.test`` (:ref:`docs <transaction-test>`) object. If you want to prevent this, you need to add ``try/catch`` to your hooks, sanitize the test object, and gracefully fail the transaction.

-  `Hooks <https://github.com/stacklych/dredd/blob/main/packages/dredd/test/fixtures/sanitation/transaction-secured-erroring-hooks.js>`__
