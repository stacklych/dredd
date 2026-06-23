import os
import sys
import re
import json
import urllib.request

from sphinx.errors import SphinxError
from pygments.lexers.data import YamlLexer

###########################################################################
#                                                                         #
#    Dredd documentation build configuration file                         #
#                                                                         #
###########################################################################


# -- Environment ----------------------------------------------------------

# Explicitly put the extensions directory to Python path
sys.path.append(os.path.abspath('_extensions'))


# -- General configuration ------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    'sphinx.ext.todo',
    'sphinx_tabs.tabs',
    'cli_options',
    'ghissue',
    'specs',
    'ghlink_check',
]

# The suffix(es) of source filenames.
# You can specify multiple suffix as a list of string:
source_suffix = '.rst'

# The master document.
master_doc = 'index'

# General information about the project.
# Dredd is the product name; the project is now owned and maintained by Stackly.
project = 'Dredd'
copyright = 'Stackly'
author = 'Stackly'

# The project version (2.6) and release (2.6.0rc1) numbers. Figuring this
# out for Dredd is tricky (because of Semantic Release), so it's hardcoded.
version = 'latest'
release = 'latest'

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This patterns also effect to html_static_path and html_extra_path
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# The name of the Pygments (syntax highlighting) style to use.
pygments_style = 'monokai'

# Suppressed warnings
suppress_warnings = [
    'image.nonlocal_uri',
]

# ToDos
todo_include_todos = True


# -- Options for HTML output ----------------------------------------------

# The theme to use for HTML and HTML Help pages. See the documentation for
# a list of builtin themes.
html_theme = 'sphinx_book_theme'

html_theme_options = {
    'repository_url': 'https://github.com/stacklych/dredd',
    'repository_branch': 'main',
    'path_to_docs': 'docs',
    'use_repository_button': True,
    'use_issues_button': True,
    'use_edit_page_button': True,
    'logo': {
        'image_light': '_static/images/dredd-logo.svg',
        'image_dark': '_static/images/dredd-logo.svg',
        'text': 'dredd',
    },
}

# The name of an image file (relative to this directory) to use as a favicon of
# the docs.  This file should be a Windows icon file (.ico) being 16x16 or 32x32
# pixels large.
#
html_favicon = '_static/favicon.svg'

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory. They are copied after the builtin static files,
# so a file named "default.css" will overwrite the builtin "default.css".
html_static_path = ['_static']

html_css_files = ['custom.css']

# Add any extra paths that contain custom files (such as robots.txt or
# .htaccess) here, relative to this directory. These files are copied
# directly to the root of the documentation.
#
# html_extra_path = []

# Additional templates that should be rendered to pages, maps page names to
# template names.
#
# html_additional_pages = {}

# If true, "(C) Copyright ..." is shown in the HTML footer. Default is True.
html_show_copyright = False

# If true, an OpenSearch description file will be output, and all pages will
# contain a <link> tag referring to it.  The value of this option must be the
# base URL from which the finished HTML is served.
#
# html_use_opensearch = ''


# -- External links check -------------------------------------------------

linkcheck_ignore = [
    'https://crates.io/crates/dredd-hooks',  # https://github.com/sphinx-doc/sphinx/pull/5140
    # Exclude Dredd repository links, because they are checked
    # by "_extensions/ghlink_check.py".
    r'https?://github\.com/apiaryio/dredd/.+',
    # DEPRECATED (follow-up): links to the former owner's sites and assets.
    # These point at Apiary-era resources and have no verified Stackly
    # replacement yet. They are tracked in docs/deprecated-links.rst and
    # ignored here so linkcheck does not fail on them. Replace once Stackly
    # equivalents exist. See docs/deprecated-links.rst.
    r'https?://apiary\.io.*',
    r'https?://help\.apiary\.io.*',
    r'https?://hub\.docker\.com/r/apiaryio/.*',
    # travis-ci.org is defunct (migrated to travis-ci.com); ignore the dead
    # CI badges/links for Dredd and the third-party hook libraries.
    r'https?://(api\.)?travis-ci\.org.*',
    r'https?://relishapp\.com/apiary/.*',
    # Pre-existing rotted or rate-limited third-party links (follow-up).
    # These are unrelated to the ownership change; they are dead/moved
    # upstream or block automated link checks. The OpenAPI 2 spec links come
    # from leftover OpenAPI-2 prose that the docs no longer need (slated for
    # removal in the deeper content cleanup).
    r'https?://docs\.docker\.com/docker-for-mac/.*',
    r'https?://github\.com/OAI/OpenAPI-Specification/blob/master/versions/2\.0\.md.*',
    r'https?://json-schema\.org/understanding-json-schema/.*',
    # npmjs.com returns 403/429 to automated link checks (anti-bot).
    r'https?://(www\.)?npmjs\.com.*',
    # Chronically slow / automated-check-hostile hosts that intermittently time
    # out (read timeout) and hard-fail the strict (-W) link check even though
    # the pages are valid. They are stable, well-known destinations:
    # - snyk.io: the Snyk vulnerability page (anti-bot, like npmjs above).
    # - ietf.org: the JSON Schema draft links and the :rfc: role resolve through
    #   tools.ietf.org, which redirects to datatracker.ietf.org; the latter
    #   regularly times out the checker.
    r'https?://snyk\.io/.*',
    r'https?://(tools|datatracker)\.ietf\.org/.*',
]

# The strict (-W) link check hits live third-party URLs, so a momentary network
# blip or slow host (e.g. mochajs.org timed out once) would hard-fail CI even
# though the link is valid. Retry a few times with a generous per-request
# timeout so transient failures don't break the build, while genuinely broken
# links are still reported.
linkcheck_retries = 3
linkcheck_timeout = 30

# Don't verify URL fragments/anchors. GitHub (and similar) serve anti-bot or
# JS-rendered pages to the link checker, so heading anchors like
# '#user-content-...' are reported as "anchor not found" intermittently even
# though the page and anchor are valid. The destination pages are still checked
# for existence; only the in-page anchor check is skipped.
linkcheck_anchors = False

sphinx_tabs_valid_builders = ['linkcheck']


# -- Theme customization --------------------------------------------------

# Directory with individual templates overriding the ones from the theme
templates_path = []


# -- Custom Pygments lexers for OpenAPI -----------------------------------

class OpenAPI3Lexer(YamlLexer):
    name = 'OpenAPI 3'
    aliases = ['openapi3']
    mimetypes = ['application/vnd.oai.openapi']


# -- Setting up extensions ------------------------------------------------

def setup(app):
    # Adding lexer for rendering OpenAPI 3 code blocks as YAML
    app.add_lexer('openapi3', OpenAPI3Lexer)
