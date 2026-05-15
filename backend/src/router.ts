export type RouteHandler = (
  request: Request,
  params: Record<string, string>,
  env: any,
  ctx: ExecutionContext
) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    });
  }

  get(path: string, handler: RouteHandler) {
    this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler) {
    this.add('POST', path, handler);
  }

  put(path: string, handler: RouteHandler) {
    this.add('PUT', path, handler);
  }

  delete(path: string, handler: RouteHandler) {
    this.add('DELETE', path, handler);
  }

  async handle(
    request: Request,
    env: any,
    ctx: ExecutionContext
  ): Promise<Response | null> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });

      return route.handler(request, params, env, ctx);
    }

    return null;
  }
}
