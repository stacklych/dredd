.. include:: _links.rst
.. _internals:

Internals
=========

Dredd itself is a `command-line <https://en.wikipedia.org/wiki/Command-line_interface>`__ `Node.js <https://nodejs.org/>`__ application written in modern JavaScript. Contents:

.. contents::
   :local:
   :depth: 1


.. _maintainers:

Maintainers
-----------

`Apiary`_ is the original author of Dredd. The original `Apiary Dredd repository <https://github.com/apiaryio/dredd>`__ was archived on November 8, 2024 and is now read-only. Active maintenance for this fork happens in `stacklych/dredd <https://github.com/stacklych/dredd>`__.

-  `@stacklych <https://github.com/stacklych>`__ - fork maintenance, releases, issue triage

.. _hall-of-fame:

Hall of fame
~~~~~~~~~~~~

Dredd supports many programming languages thanks to the work of several contributors. They deserve eternal praise for dedicating time to create, improve, and maintain the respective :ref:`hooks handlers <hooks>`:

-  `@ddelnano <https://github.com/ddelnano>`__ (:ref:`PHP <hooks-php>`, :ref:`Go <hooks-go>`)
-  `@gonzalo-bulnes <https://github.com/gonzalo-bulnes>`__ (:ref:`Ruby <hooks-ruby>`)
-  `@hobofan <https://github.com/hobofan>`__ (:ref:`Rust <hooks-rust>`)
-  `@snikch <https://github.com/snikch>`__ (:ref:`Go <hooks-go>`)
-  `@ungrim97 <https://github.com/ungrim97>`__ (:ref:`Perl <hooks-perl>`)

Big thanks also to `@netmilk <https://github.com/netmilk/>`__, the original author of Dredd and `Gavel`_!


.. _contributing:

Contributing
------------

We are grateful for any contributions made by the community. Even seemingly small contributions such as fixing a typo in the documentation or reporting a bug are very appreciated!

To contribute to this maintained fork, open issues and pull requests in `stacklych/dredd <https://github.com/stacklych/dredd>`__. See also the root ``MAINTAINERS.md`` and ``SECURITY.md`` files.


.. _install-dev:

Installing Dredd for development
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To hack Dredd locally, clone the repository and run ``npm install`` to install JavaScript dependencies. Then run ``npm test`` to verify everything works as expected. If you want to run Dredd during development, you can do so using ``./bin/dredd``.

.. note::

    See also the full :ref:`installation guide <install-npm>`.


.. _semantic-relase-and-conventional-changelog:
.. _conventional-changelog:
.. _semantic-relase:
.. _sem-rel:

Commit message format
~~~~~~~~~~~~~~~~~~~~~

This maintained fork uses `Semantic Versioning <https://semver.org/>`__ and keeps the existing Conventional Changelog commit format. Automated npm publishing is not configured for the maintained fork yet. Before publishing, decide and document the package names for the forked distribution.

.. code-block:: text

    <type>: <message>

Where ``<type>`` is a prefix, which tells Semantic Release what kind of changes you made in the commit:

-  ``feat`` - New functionality added (results in _minor_ version bump)
-  ``fix`` - Broken functionality fixed (results in _patch_ version bump)
-  ``refactor`` - Changes in code, but no changes in behavior
-  ``perf`` - Performance improved
-  ``style`` - Changes in code formatting
-  ``test`` - Changes in tests
-  ``docs`` - Changes in documentation
-  ``chore`` - Changes in package or repository configuration

In the rare cases when your changes break backwards compatibility, the message must include ``BREAKING CHANGE:``, followed by an explanation. That will result in bumping the major version.

.. code-block:: text

    feat: add option "--require" to support custom transpilers

    Remove bult-in compilation of CoffeeScript.

    Close #1234

    BREAKING CHANGE: Hookfiles using CoffeeScript are not supported
    out of the box anymore. Instead manually install the coffeescript
    module and add --require=coffeescript/register to your command.

-   See `existing commits <https://github.com/stacklych/dredd/commits/master>`__ as a reference
-   `Commitizen CLI <https://github.com/commitizen/cz-cli>`__ can help you to create correct commit messages
-   Run ``npm run lint`` to validate format of your messages
-   Use ``refactor`` together with ``BREAKING CHANGE:`` for changes in code which only remove features (there doesn't seem to be a better category for that use case) -- see `real-world example <https://github.com/apiaryio/dredd/commit/a5fe81b>`__


GitHub labels
~~~~~~~~~~~~~

.. todo::

   This section is not written yet. See :ghissue:`#808`.


.. _programming-language:

Programming language
~~~~~~~~~~~~~~~~~~~~

Dredd is written in modern JavaScript, ran by `Node.js <https://nodejs.org/>`__, and distributed by `npm <https://www.npmjs.com/>`__.

Previously Dredd was written in `CoffeeScript <https://coffeescript.org>`__, and it was only recently converted to modern JavaScript. That's why sometimes the code does not feel very nice. Any efforts to refactor the code to something more human-friendly are greatly appreciated.

Supported Node.js versions
~~~~~~~~~~~~~~~~~~~~~~~~~~

Given the `table with LTS schedule <https://github.com/nodejs/Release>`__, only versions marked as **Current**, **Maintenance**, or **Active** are supported, until their **Maintenance End**. The testing matrix of Dredd’s CI builds must contain all currently supported versions and must not contain any unsupported versions. The same applies for the underlying libraries, such as `Dredd Transactions`_. In ``appveyor.yml`` the latest supported Node.js version should be used. When dropping support for Node.js versions, remember to update the :ref:`installation guide <install-npm>`.

When dropping support for a certain Node.js version, it should be removed from the testing matrix, and it **must** be delivered as a breaking change, which increments Dredd's major version number.


Dependencies
~~~~~~~~~~~~

New versions of dependencies are monitored by `Dependabot <https://dependabot.com/>`__. Vulnerabilities are monitored by `Snyk <https://snyk.io/test/npm/dredd>`__.

Dependencies should not be specified in a loose way - only exact versions are allowed. This is ensured by ``.npmrc`` and the lock file. Any changes to dependencies (version upgrades included) are a subject to internal policies and must be first checked and approved by the maintainers before merged to ``master``. This is because we are trying to be good Open Source citizens and to do our best to comply with licenses of all our dependencies.

As a contributor, before adding a new dependency or upgrading an existing one, please try to `make sure <https://github.com/davglass/license-checker>`__ the project and all its transitive dependencies feature standard permissive licenses, including correct copyright holders and license texts.


Versioning
~~~~~~~~~~

Dredd follows `Semantic Versioning <https://semver.org/>`__. The releasing process is fully automated by `Semantic Release <https://github.com/semantic-release/semantic-release>`__.

There are two release tags: ``latest`` and ``stable``. Currently they both point to the latest version. The ``stable`` tag exists only for backward compatibility with how Dredd used to be distributed in the past. It might get removed in the future.


Testing
~~~~~~~

Use ``npm test`` to run all tests. Dredd uses `Mocha <https://mochajs.org/>`__ as a test framework. Its default options are in the ``test/mocha.opts`` file.


Linting
~~~~~~~

Dredd uses `eslint <https://eslint.org/>`__ to test the quality of the JavaScript codebase. We are adhering to the `Airbnb’s styleguide <https://github.com/airbnb/javascript>`__. Several rules are disabled to allow us to temporarily have dirty code after we migrated from CoffeeScript to JavaScript. The long-term intention is to remove all these exceptions.

The linter is optional for local development to make easy prototyping and working with unpolished code, but it’s enforced on the CI level. It is recommended you integrate `eslint <https://eslint.org/>`__ with your favorite editor so you see violations immediately during coding.


Continuous integration
~~~~~~~~~~~~~~~~~~~~~~

`GitHub Actions <https://github.com/stacklych/dredd/actions>`__ runs the checks on every push: ``run-test`` (build, lint, formatting check, and the test suite), ``run-e2e-tests`` and ``run-smoke-tests`` (end-to-end and smoke runs), and ``commitlint`` (validates the commit message against the Conventional Changelog format).

The documentation checks in ``run-docs-test`` — the Sphinx ``linkcheck``, the ``docs/_extensions`` unit tests, and the HTML build — are path-filtered. They run only when files under ``docs/``, the root ``package.json`` (which holds the ``docs:*`` scripts), or the workflow itself change. This keeps Sphinx and its external-network link check off code-only pushes, while documentation breakage is still caught on the pull request that introduces it.


Changelog
~~~~~~~~~

Changelog entries for this maintained fork are tracked in the root ``CHANGELOG.md`` and can also be published as `GitHub Releases <https://github.com/stacklych/dredd/releases>`__.

Automated release note generation can be restored later after the fork's npm publishing scope is decided.


Coverage
~~~~~~~~

Tests coverage is a metric which helps developer to see which code **is not** tested. This is useful when introducing new code in Pull Requests or when maintaining under-tested old code (coverage shows that changes to such code are without any safety net).

Coverage is measured locally with `c8 <https://github.com/bcoe/c8>`__ (Node's built-in V8 coverage), with no external service. Measure a single package with:

.. code-block:: shell

    npm run test:coverage

or all packages from the repo root with ``yarn test:coverage``. Each package writes an ``lcov`` report plus a console summary to its own ``coverage/`` directory (git-ignored). Coverage is report-only for now — it is not yet enforced as a CI gate.

.. note::

    The previous Coveralls integration was removed due to reoccurring service denial. ``c8`` replaces it with a local, service-free report.


.. _hacking-apiary-reporter:

Hacking Apiary reporter
~~~~~~~~~~~~~~~~~~~~~~~

If you want to build something on top of the Apiary Reporter, note that
it uses a public API for authenticated test reports

Following data are sent over the wire to Apiary:

-  :ref:`Apiary Reporter Test Data <apiary-reporter-test-data>`

The ``APIARY_API_URL`` environment variable allows the developer to override the host of the Apiary Tests API.


Contributing to documentation
-----------------------------

The documentation is written `as code <http://www.writethedocs.org/guide/docs-as-code/>`__ in the `reStructuredText <http://www.sphinx-doc.org/en/master/usage/restructuredtext/basics.html>`__ format and its source files are located in the `docs <https://github.com/stacklych/dredd/tree/master/docs>`__ directory.

The historical documentation site is https://dredd.org. This maintained fork should link to the fork repository until a new documentation hosting target is configured.


Building documentation locally
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The documentation is built by `Sphinx <http://www.sphinx-doc.org/>`__. To render it on your computer, you need `Python 3 <https://www.python.org/>`__.

#. `Get Python 3 <https://www.python.org/downloads/>`__.
#. Create a `virtual environment <https://docs.python.org/3/library/venv.html>`__ and activate it:

   .. code-block:: shell

      python3 -m venv ./venv
      source ./venv/bin/activate

#. Install dependencies for the docs:

   .. code-block:: shell

      (venv)$ pip install -r docs/requirements.txt

   .. note::

      We are not using `pipenv <https://github.com/pypa/pipenv>`__ as it is not yet properly supported by ReadTheDocs.

Now you can use following commands:

-  ``npm run docs:lint`` - Checks quality of the documentation (broken internal and external links, reStructuredText markup mistakes, etc.)
-  ``npm run docs:build`` - Builds the documentation
-  ``npm run docs:serve`` - Runs live preview of the documentation on ``http://127.0.0.1:8000``


Writing documentation
~~~~~~~~~~~~~~~~~~~~~

-  Read the `reStructuredText primer <http://www.sphinx-doc.org/en/master/usage/restructuredtext/basics.html>`_
-  No explicit newlines, please - write each paragraph as a single long line and turn on word wrap in your editor
-  Explicit is better than implicit:

    - Bad: ``npm i -g``
    - Good: ``npm install --global``

-  When using Dredd's long CLI options in tests or documentation, please always use the notation with ``=`` wherever possible:

    - Bad: ``--path /dev/null``
    - Good: ``--path=/dev/null``

   While both should work, the version with ``=`` feels more like standard GNU-style long options and it makes arrays of arguments for ``spawn`` more readable.
-  Do not `title case <https://en.wikipedia.org/wiki/Letter_case#Headings_and_publication_titles>`__ headings, life's too short to spend it figuring out title casing correctly
-  Using ``127.0.0.1`` (in code, tests, documentation) is preferred over ``localhost`` (see :ghissue:`#586`)
-  Be consistent


.. _images:

Images
~~~~~~

Images are in the ``docs/_static/images`` directory. For images exported in sophisticated graphic formats, the source file should be committed to Git and placed in the same directory, with the same basename, just with different extension.

.. note::
    The ``.key`` files are not SSH keys, they're `Keynote <https://www.apple.com/keynote/>`__ source files. It is `@honzajavorek <https://github.com/honzajavorek>`__'s deviation to draw charts in Keynote and to export them as PNGs::

        File » Export To » Images... » Format: PNG


Sphinx extensions
~~~~~~~~~~~~~~~~~

There are several extensions to Sphinx, which add custom directives and roles to the reStructuredText syntax:

CLI options
    Allows to automatically generate documentation of Dredd's CLI options from the JSON file which specifies them. Usage: ``.. cli-options:: ./path/to/file.json``

GitHub issues
    Simplifies linking GitHub issues. Usage: ``:ghissue:`drafter#123```

GitHub links checker
    Fails the docs build if there's an absolute link (``github.com/apiaryio/dredd/blob/master``) to a non-existing local file

OpenAPI 3 spec
    Simplifies linking the `OpenAPI 3`_ spec. Usage: ``:openapi3:`parameterobject```

OpenAPI 3.1 spec
    Simplifies linking the `OpenAPI 3.1`_ spec. Usage: ``:openapi31:`parameter-object```

RFCs
    Simplifies linking the RFCs. Not a custom extension in fact, this is provided by Sphinx out of the box. Usage: ``:rfc:`1855```

The extensions are written in Python 3 and are heavily based on the knowledge shared in the `FOSDEM 2018 talk by Stephen Finucane <https://archive.fosdem.org/2018/schedule/event/automating_documentation_with_sphinx_extensions/>`__. Extensions use Python's `unittest <https://docs.python.org/3/library/unittest.html>`__ for tests. You can use ``npm run docs:test-extensions`` to run them.


Redirects
~~~~~~~~~

Redirects are documented in the ``docs/redirects.yml`` file. They were historically configured in ReadTheDocs. A maintained-fork documentation host has not been configured yet.

You can use the `rtd-redirects <https://github.com/honzajavorek/rtd-redirects>`__ tool to programmatically upload the redirects from ``docs/redirects.yml`` to the ReadTheDocs admin interface.


Windows support
---------------

Dredd has historical Windows support. The maintained fork should verify Windows behavior through GitHub Actions before publishing releases that claim Windows compatibility.


API description parsing
-----------------------

.. todo::

   This section is not written yet. See :ghissue:`#820`.

Architecture
------------

.. todo::

   This section is not written yet. See :ghissue:`#820`.
