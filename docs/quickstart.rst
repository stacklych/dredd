.. include:: _links.rst
.. _quickstart:

Quickstart
==========

In following tutorial you can quickly learn how to test a simple HTTP API application with Dredd. The tested application will be very simple backend written in `Express.js <https://expressjs.com/en/starter/hello-world.html>`__.

Install Dredd
-------------

::

   $ npm install -g dredd

If you’re not familiar with the Node.js ecosystem or you bump into any issues, follow the :ref:`installation guide <installation>`.

Document Your API
-----------------

First, let’s design the API we are about to build and test. That means you will need to create an API description file, which will document how your API should look like. Dredd supports **OpenAPI 3.0 and OpenAPI 3.1** (API Blueprint and OpenAPI 2 are no longer supported).

Create a file called ``api-description.yaml`` with the following content:

.. code-block:: openapi3

   openapi: 3.1.0
   info:
     version: '1.0'
     title: Example API
     license:
       name: MIT
   paths:
     /:
       get:
         responses:
           '200':
             description: ''
             content:
               application/json; charset=utf-8:
                 schema:
                   type: object
                   properties:
                     message:
                       type: string
                   required:
                     - message

.. note::
   The same description works as OpenAPI 3.0 — set ``openapi: 3.0.3`` instead. Dredd validates response data types for both versions.

Implement Your API
------------------

As we mentioned in the beginning, we’ll use `Express.js <https://expressjs.com/en/starter/hello-world.html>`__ to implement the API. Install the framework by ``npm``:

.. code-block:: shell

   $ npm init
   $ npm install express --save

Now let’s code the thing! Create a file called ``app.js`` with following contents:

.. code-block:: javascript

   var app = require('express')();

   app.get('/', function(req, res) {
     res.json({message: 'Hello World!'});
   })

   app.listen(3000);

Test Your API
-------------

At this moment, the implementation is ready to be tested. Let’s run the server as a background process and let’s test it:

.. code-block:: shell

   $ node app.js &

Finally, let Dredd validate whether your freshly implemented API complies with the description you have:

.. code-block:: shell

   $ dredd api-description.yaml http://127.0.0.1:3000


Configure Dredd
---------------

Dredd can be configured by :ref:`many CLI options <usage-cli>`. It’s recommended to save your Dredd configuration alongside your project, so it’s easier to repeatedly execute always the same test run. Use interactive configuration wizard to create ``dredd.yml`` file in the root of your project:

::

   $ dredd init
   ? Location of the API description document: api-description.yaml
   ? Command to start API backend server e.g. (bundle exec rails server)
   ? URL of tested API endpoint: http://127.0.0.1:3000
   ? Programming language of hooks:
   ❯ nodejs
     python
     ruby
     ...
   ? Dredd is best served with Continuous Integration. Create CircleCI config for Dredd? Yes

Now you can start test run just by typing ``dredd``!

::

   $ dredd

Use Hooks
---------

Dredd’s :ref:`hooks <hooks>` enable you to write some glue code in your favorite language to support enhanced scenarios in your API tests. Read the documentation about hooks to learn more on how to write them. Choose your language and install corresponding hooks handler library.

Advanced Examples
-----------------

For more complex example applications, please refer to:

-  `Express.js <https://github.com/apiaryio/dredd-example>`__
-  `Laravel <https://github.com/ddelnano/dredd-hooks-php/wiki/Laravel-Example>`__
-  `Laravel & OpenAPI 3 <https://github.com/AndyWendt/laravel-dredd-openapi-v3>`__
-  `Ruby on Rails <https://gitlab.com/theodorton/dredd-test-rails/>`__
