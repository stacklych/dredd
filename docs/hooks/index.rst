.. include:: ../_links.rst


.. _hook-scripts:
.. _hooks:

Hooks
=====

Dredd supports *hooks*, which are blocks of arbitrary code that run before or after each test step. The concept is similar to XUnit's ``setUp`` and ``tearDown`` functions, `Cucumber hooks <https://cucumber.io/docs/cucumber/api/#hooks>`__, or `Git hooks <https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks>`__. Hooks are usually used for:

-  Loading database fixtures,
-  cleaning up after test step(s),
-  handling auth and sessions,
-  passing data between transactions (saving state from responses),
-  modifying a request generated from the API description,
-  changing generated expectations,
-  setting custom expectations,
-  debugging by logging stuff.


Getting started
---------------

Let's have a description of a blog API, which allows to list all articles, and to publish a new one.

.. literalinclude:: ../../packages/dredd/test/fixtures/blog/apidesc.openapi3.yaml
   :language: openapi3

Now let's say the real instance of the API has the POST request protected so it is not possible for everyone to publish new articles. We do not want to hardcode secret tokens in our API description, but we want to get Dredd to pass the auth. This is where the hooks can help.


Writing hooks
~~~~~~~~~~~~~

Hooks are functions, which are registered to be ran for a specific test step (HTTP transaction) and at a specific point in Dredd's :ref:`execution life cycle <execution-life-cycle>`. Hook functions take one or more :ref:`transaction objects <transaction>`, which they can modify. Let's use hooks to add an `Authorization header <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization>`__ to Dredd's request.

Dredd runs hooks written in JavaScript, which are available out of the box.

Let's create a file called ``hooks.js`` with the following content:

.. literalinclude:: ../../packages/dredd/test/fixtures/blog/hooks.openapi3.js
   :language: javascript

As you can see, we're registering the hook function to be executed **before** the HTTP transaction ``/articles > Publish an article > 201 > application/json; charset=utf-8``. This path-like identifier is a :ref:`transaction name <transaction-names>`.


Running Dredd with hooks
~~~~~~~~~~~~~~~~~~~~~~~~

With the API instance running locally at ``http://127.0.0.1:3000``, you can now run Dredd with hooks using the :option:`--hookfiles` option:

.. code-block:: text

   dredd ./blog.yaml http://127.0.0.1:3000 --hookfiles=./hooks.js

Now the tests should pass even if publishing new article requires auth.


JavaScript hooks
----------------

Dredd is written in JavaScript and runs :ref:`JavaScript hooks <hooks-js>` out of the box — no extra installation required.

.. toctree::
   :maxdepth: 1

   JavaScript <js>


.. _transaction-names:
.. _getting-transaction-names:

Transaction names
-----------------

Transaction names are path-like strings, which allow hook functions to address specific HTTP transactions. They intuitively follow the structure of your API description document.

You can get a list of all transaction names available in your API description document by calling Dredd with the :option:`--names` option:

.. code-block:: text
   :emphasize-lines: 3, 5

   $ dredd ./blog.yaml http://127.0.0.1:3000 --names
   info: /articles > List articles > 200 > application/json; charset=utf-8
   skip: GET (200) /articles
   info: /articles > Publish an article > 201 > application/json; charset=utf-8
   skip: POST (201) /articles
   complete: 0 passing, 0 failing, 0 errors, 2 skipped, 2 total
   complete: Tests took 9ms

As you can see, the document ``./blog.yaml`` contains two transactions, which you can address in hooks as:

- ``/articles > List articles > 200 > application/json; charset=utf-8``
- ``/articles > Publish an article > 201 > application/json; charset=utf-8``

A name is built from these parts, separated by ``>``:

1. The API title (``info.title``).
2. The resource: in OpenAPI 3.0 documents, the Path Item ``summary``, or the path template (e.g. ``/articles/{id}``) when there is none. In OpenAPI 3.1 and 3.2 documents, always the path template.
3. The action: in OpenAPI 3.0 documents, the Operation ``summary``, or the HTTP method (e.g. ``GET``) when there is none. In OpenAPI 3.1 and 3.2 documents, always the HTTP method.
4. The expected status code (``200`` for a ``default`` response), then the response media type.

Because of the difference in parts 2 and 3, changing a document's ``openapi`` version from 3.0 to 3.1 or 3.2 renames its transactions when the document has summaries. Update hooks keyed by name, or list the new names with :option:`--names`.

When two transactions would get the same name, the first one keeps it and the others get extra parts: ``request <media type>`` when their request ``Content-Type`` differs, ``default`` when they come from a ``default`` response, and ``#2``, ``#3``, … if the name is still not unique. For example, a ``POST`` with ``application/json`` and ``application/xml`` request bodies produces ``API > /articles > POST > 201 > application/json`` and ``API > /articles > POST > 201 > application/json > request application/xml``.

.. note::
   The transaction names and the :option:`--names` workflow mostly do their job, but with `many documented flaws <https://github.com/apiaryio/dredd/labels/Epic%3A%20Transaction%20Names>`__. A successor to transaction names is being designed in :ghissue:`#227`


.. _types-of-hooks:

Types of hooks
--------------

Hooks get executed at specific points in Dredd's :ref:`execution life cycle <execution-life-cycle>`. Available types of hooks are:

-  ``beforeAll`` called with all HTTP transactions before the whole test run
-  ``beforeEach`` called before each HTTP transaction
-  ``before`` called before a single HTTP transaction
-  ``beforeEachValidation`` called before each HTTP transaction is validated
-  ``beforeValidation`` called before a single HTTP transaction is validated
-  ``after`` called after a single HTTP transaction
-  ``afterEach`` called after each HTTP transaction
-  ``afterAll`` called with all HTTP transactions after the whole test run
