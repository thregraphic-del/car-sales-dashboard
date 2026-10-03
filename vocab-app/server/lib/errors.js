// Errors with an HTTP status and a message written for the learner.
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

export const notFound = (what = 'هذا العنصر') => httpError(404, `لم نجد ${what}.`);
