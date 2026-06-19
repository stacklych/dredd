.. include:: _links.rst
.. _index:

Dredd — HTTP API Testing Framework
==================================

..

   **Dredd is a language-agnostic command-line tool for validating API description document against backend implementation of the API.**

Dredd reads your API description and step by step validates whether your API implementation replies with responses as they are described in the documentation.

Maintained fork
---------------

This documentation belongs to the **Stackly**-maintained fork at `stacklych/dredd <https://github.com/stacklych/dredd>`__. The original `Apiary Dredd <https://github.com/apiaryio/dredd>`__ repository was archived upstream on November 8, 2024 and is now read-only. This fork keeps the original MIT license notice and continues development independently.

Features
--------

Supported API Description Formats
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. note::

   Dredd supports **OpenAPI 3.0 and OpenAPI 3.1 only**. API Blueprint and
   OpenAPI 2 (Swagger) are no longer supported. Convert older descriptions to
   OpenAPI 3 before using Dredd.

-  `OpenAPI 3`_ (3.0)
-  `OpenAPI 3.1`_

Both versions validate response status, structure, and **data types** against the described schemas — including ``$ref``, ``allOf``, arrays, ``nullable``, and string formats.

Supported Hooks Languages
~~~~~~~~~~~~~~~~~~~~~~~~~

Dredd supports writing :ref:`hooks <hooks>` — a glue code for each test setup and teardown. Following languages are supported:

-  :ref:`Go <hooks-go>`
-  :ref:`Node.js (JavaScript) <hooks-nodejs>`
-  :ref:`Perl <hooks-perl>`
-  :ref:`PHP <hooks-php>`
-  :ref:`Python <hooks-python>`
-  :ref:`Ruby <hooks-ruby>`
-  :ref:`Rust <hooks-rust>`
-  Didn’t find your favorite language? :ref:`Add a new one! <hooks-new-language>`

Supported Systems
~~~~~~~~~~~~~~~~~

-  Linux, macOS, Windows, …
-  `Travis CI`_, `CircleCI`_, `Jenkins`_, `AppVeyor`_, …

Contents
--------

.. toctree::
   :maxdepth: 2

   installation
   quickstart
   how-it-works
   how-to-guides
   Usage <usage-cli>
   JavaScript API <usage-js>
   Hooks <hooks/index>
   data-structures
   internals

Useful Links
------------

-  `GitHub Repository <https://github.com/stacklych/dredd>`__
-  `Bug Tracker <https://github.com/stacklych/dredd/issues?q=is%3Aopen>`__
-  `Changelog <https://github.com/stacklych/dredd/releases>`__

Example Applications
--------------------

-  `Express.js <https://github.com/apiaryio/dredd-example>`__
-  `Laravel <https://github.com/ddelnano/dredd-hooks-php/wiki/Laravel-Example>`__
-  `Laravel & OpenAPI 3 <https://github.com/AndyWendt/laravel-dredd-openapi-v3>`__
-  `Ruby on Rails <https://gitlab.com/theodorton/dredd-test-rails/>`__
