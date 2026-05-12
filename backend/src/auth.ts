export function getUserId(request: Request): string | null {
  return request.headers.get('X-User-Id');
}

export function requireUserId(request: Request): string {
  const userId = getUserId(request);
  if (!userId) {
    throw new Response(JSON.stringify({ error: 'Missing X-User-Id header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return userId;
}
