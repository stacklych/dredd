// @ts-check
import hooksLog from './hooksLog';

// READ THIS! Disclaimer:
// Do not add any functionality to this class unless you want to expose it to the Hooks API.
// This class is only an interface for users of Dredd hooks.

/**
 * @typedef {(...args: any[]) => any} Hook A user-supplied hook callback
 * @typedef {{ timestamp: number, content: string }} HookLog
 * @typedef {object} HooksOptions
 * @property {HookLog[]} [logs]
 * @property {{ hook?: (content: any) => void }} [logger]
 */

class Hooks {
  /** @param {HooksOptions} options */
  constructor(options = {}) {
    this.before = this.before.bind(this);
    this.beforeValidation = this.beforeValidation.bind(this);
    this.after = this.after.bind(this);
    this.beforeAll = this.beforeAll.bind(this);
    this.afterAll = this.afterAll.bind(this);
    this.beforeEach = this.beforeEach.bind(this);
    this.beforeEachValidation = this.beforeEachValidation.bind(this);
    this.afterEach = this.afterEach.bind(this);
    this.log = this.log.bind(this);
    this.logs = options.logs;
    this.logger = options.logger;
    /** @type {Record<string, Hook[]>} */
    this.beforeHooks = {};
    /** @type {Record<string, Hook[]>} */
    this.beforeValidationHooks = {};
    /** @type {Record<string, Hook[]>} */
    this.afterHooks = {};
    /** @type {Hook[]} */
    this.beforeAllHooks = [];
    /** @type {Hook[]} */
    this.afterAllHooks = [];
    /** @type {Hook[]} */
    this.beforeEachHooks = [];
    /** @type {Hook[]} */
    this.beforeEachValidationHooks = [];
    /** @type {Hook[]} */
    this.afterEachHooks = [];
  }

  /** @param {string} name @param {Hook} hook */
  before(name, hook) {
    this.addHook(this.beforeHooks, name, hook);
  }

  /** @param {string} name @param {Hook} hook */
  beforeValidation(name, hook) {
    this.addHook(this.beforeValidationHooks, name, hook);
  }

  /** @param {string} name @param {Hook} hook */
  after(name, hook) {
    this.addHook(this.afterHooks, name, hook);
  }

  /** @param {Hook} hook */
  beforeAll(hook) {
    this.beforeAllHooks.push(hook);
  }

  /** @param {Hook} hook */
  afterAll(hook) {
    this.afterAllHooks.push(hook);
  }

  /** @param {Hook} hook */
  beforeEach(hook) {
    this.beforeEachHooks.push(hook);
  }

  /** @param {Hook} hook */
  beforeEachValidation(hook) {
    this.beforeEachValidationHooks.push(hook);
  }

  /** @param {Hook} hook */
  afterEach(hook) {
    this.afterEachHooks.push(hook);
  }

  /** @param {Record<string, Hook[]>} hooks @param {string} name @param {Hook} hook */
  addHook(hooks, name, hook) {
    if (hooks[name]) {
      hooks[name].push(hook);
    } else {
      hooks[name] = [hook];
    }
  }

  // log(logVariant, content)
  // log(content)
  /** @param {...any} args */
  log(...args) {
    // hooksLog only consumes a single `content` argument; spreading `args`
    // bound it to `args[0]` and ignored the rest, so pass it directly.
    this.logs = hooksLog(this.logs, this.logger, args[0]);
  }
}

export default Hooks;
