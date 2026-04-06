/**
 * router.d.ts — TypeScript type definitions for @cbetts1/router
 */

export interface ParsedInput {
  /** Normalised (lowercase, trimmed) command name. */
  command: string;
  /** Remaining tokens after the command name. */
  args: string[];
  /** Original raw input value. */
  raw: string | object;
}

export interface RouterResult {
  /** 'ok' on success, 'error' on failure (or any custom status string). */
  status: 'ok' | 'error' | string;
  /** The command that was dispatched. */
  command: string;
  /** Payload returned by the handler or an error message string. */
  result: any;
  /** Any additional fields the handler or middleware may have added. */
  [key: string]: any;
}

/** A synchronous or asynchronous command handler. */
export type CommandHandler = (args: string[], context: object) => any | Promise<any>;

/**
 * Middleware function — wraps every handle() call.
 * Call next() to proceed to the next middleware or the command handler.
 * The return value of next() is a Promise of the result, enabling
 * post-processing ("onion model").
 */
export type MiddlewareFunction = (
  parsed: ParsedInput,
  context: object,
  next: () => Promise<RouterResult>
) => Promise<RouterResult>;

/** Module definition object passed to router.use(). */
export interface ModuleObject {
  /** Short command handlers — auto-registered as `moduleName:commandName`. */
  commands?: { [commandName: string]: CommandHandler };
  /** Semantic version of this module (e.g. '1.2.0'). */
  version?: string;
  /** Other mounted module names that must be present before this module's commands run. */
  requires?: string[];
  /** Called once when the module is successfully mounted. */
  onMount?: (router: Router) => void;
  /** Called once just before the module is unmounted. */
  onUnmount?: (router: Router) => void;
  /** Called on every dispatched command while this module is mounted. */
  onCommand?: (parsed: ParsedInput, context: object) => void;
  [key: string]: any;
}

/** Shape returned by getModules(). */
export interface ModuleInfo {
  name: string;
  version: string | null;
}

/** Shape returned by describe(). */
export interface CommandDescription {
  name: string;
  /** 'builtin', 'user', or 'module:<moduleName>' */
  source: string;
  /** The .name property of the handler function. */
  handlerName: string;
  /** Unix timestamp (ms) when the command was registered. */
  registeredAt: number;
  priority: number;
}

/** Single entry in the command history ring buffer. */
export interface HistoryEntry {
  command: string;
  args: string[];
  status: string;
  /** Wall-clock milliseconds the handle() call took. */
  duration: number;
  /** Unix timestamp (ms) when the entry was recorded. */
  timestamp: number;
}

/** Per-command metrics returned by getMetrics(). */
export interface CommandMetrics {
  calls: number;
  errors: number;
  /** Average duration in milliseconds across all calls. */
  avgLatency: number;
}

/** Options for registerCommand(). */
export interface RegisterCommandOptions {
  /**
   * Dispatch priority — higher numbers win when multiple handlers could
   * match a command (exact vs. wildcard, or duplicate registrations).
   * Defaults to 0.
   */
  priority?: number;
}

/** Options for createRouter(). */
export interface RouterOptions {
  /**
   * Custom logger object with .log / .warn / .error methods.
   * Pass null to suppress all internal logging.
   * Defaults to console.
   */
  logger?: { log: Function; warn: Function; error?: Function } | null;
  /**
   * Custom handler for commands that are not found in the registry.
   * Defaults to a handler that returns an error result with a "Type help" hint.
   */
  fallback?: (parsed: ParsedInput, context: object) => Promise<RouterResult>;
  /**
   * Maximum number of entries in the history ring buffer.
   * Defaults to 100.
   */
  historySize?: number;
}

/** The router instance created by createRouter(). */
export interface Router {
  /**
   * Dispatch a command.  Always resolves — never rejects.
   * Runs all registered middleware, then the matching command handler.
   */
  handle(input: string | object, context?: object): Promise<RouterResult>;

  /**
   * Register a command handler.
   * The name may include a `*` wildcard (e.g. `'fs:*'`) to match a namespace.
   * @throws {TypeError} if name is not a non-empty string or handler is not a function.
   */
  registerCommand(name: string, handler: CommandHandler, options?: RegisterCommandOptions): void;

  /**
   * Remove a command or wildcard pattern from the registry.
   * @returns true if found and removed, false if not found.
   * @throws {TypeError} if name is not a string.
   */
  unregisterCommand(name: string): boolean;

  /**
   * Mount a module (hot-swap safe).
   * Module commands are auto-registered as `moduleName:commandName`.
   * @throws {TypeError} if moduleName is not a non-empty string or moduleObject is not an object.
   */
  use(moduleName: string, moduleObject: ModuleObject): void;

  /**
   * Register a global middleware function that wraps every handle() call.
   */
  use(middleware: MiddlewareFunction): void;

  /**
   * Unmount a module and remove its auto-registered namespaced commands.
   * @returns true if found and removed, false if not found.
   * @throws {TypeError} if moduleName is not a string.
   */
  unuse(moduleName: string): boolean;

  /** Subscribe to an event on the internal event bus. */
  on(event: string, listener: Function): void;

  /** Unsubscribe a previously registered event listener. */
  off(event: string, listener: Function): void;

  /** Emit a custom event on the internal event bus. */
  emit(event: string, ...args: any[]): void;

  /** Subscribe to an event for a single firing, then automatically unsubscribe. */
  once(event: string, listener: Function): void;

  /**
   * Return all registered command names and wildcard patterns, sorted.
   */
  getCommands(): string[];

  /**
   * Return information about all currently mounted modules, sorted by name.
   */
  getModules(): ModuleInfo[];

  /**
   * Return a copy of the command history ring buffer (oldest entry first).
   */
  getHistory(): HistoryEntry[];

  /**
   * Return per-command call metrics.
   */
  getMetrics(): { [command: string]: CommandMetrics };

  /**
   * Return metadata about a registered command or wildcard pattern.
   * Returns null if the command is not registered.
   * @throws {TypeError} if commandName is not a string.
   */
  describe(commandName: string): CommandDescription | null;

  /** Semantic version string of the router (e.g. '1.1.0'). */
  readonly version: string;

  /** Well-known module slot names (cpu, terminal, os, filesystem, services, ai). */
  readonly knownModules: string[];
}

/**
 * Create a new, independent router instance.
 * Multiple instances never share state.
 */
export function createRouter(options?: RouterOptions): Router;
