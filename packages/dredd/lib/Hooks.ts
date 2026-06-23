import hooksLog from './hooksLog';

// READ THIS! Disclaimer:
// Do not add any functionality to this class unless you want to expose it to the Hooks API.
// This class is only an interface for users of Dredd hooks.

/** A user-supplied hook callback */
type Hook = (...args: any[]) => any;
interface HookLog {
  timestamp: number;
  content: string;
}
interface HooksOptions {
  logs?: HookLog[];
  logger?: { hook?: (content: any) => void };
}

class Hooks {
  logs: HookLog[] | undefined;
  logger: { hook?: (content: any) => void } | undefined;
  beforeHooks: Record<string, Hook[]>;
  beforeValidationHooks: Record<string, Hook[]>;
  afterHooks: Record<string, Hook[]>;
  beforeAllHooks: Hook[];
  afterAllHooks: Hook[];
  beforeEachHooks: Hook[];
  beforeEachValidationHooks: Hook[];
  afterEachHooks: Hook[];

  constructor(options: HooksOptions = {}) {
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
    this.beforeHooks = {};
    this.beforeValidationHooks = {};
    this.afterHooks = {};
    this.beforeAllHooks = [];
    this.afterAllHooks = [];
    this.beforeEachHooks = [];
    this.beforeEachValidationHooks = [];
    this.afterEachHooks = [];
  }

  before(name: string, hook: Hook) {
    this.addHook(this.beforeHooks, name, hook);
  }

  beforeValidation(name: string, hook: Hook) {
    this.addHook(this.beforeValidationHooks, name, hook);
  }

  after(name: string, hook: Hook) {
    this.addHook(this.afterHooks, name, hook);
  }

  beforeAll(hook: Hook) {
    this.beforeAllHooks.push(hook);
  }

  afterAll(hook: Hook) {
    this.afterAllHooks.push(hook);
  }

  beforeEach(hook: Hook) {
    this.beforeEachHooks.push(hook);
  }

  beforeEachValidation(hook: Hook) {
    this.beforeEachValidationHooks.push(hook);
  }

  afterEach(hook: Hook) {
    this.afterEachHooks.push(hook);
  }

  addHook(hooks: Record<string, Hook[]>, name: string, hook: Hook) {
    if (hooks[name]) {
      hooks[name].push(hook);
    } else {
      hooks[name] = [hook];
    }
  }

  // log(logVariant, content)
  // log(content)
  log(...args: any[]) {
    // hooksLog only consumes a single `content` argument; spreading `args`
    // bound it to `args[0]` and ignored the rest, so pass it directly.
    this.logs = hooksLog(this.logs, this.logger, args[0]);
  }
}

export default Hooks;
