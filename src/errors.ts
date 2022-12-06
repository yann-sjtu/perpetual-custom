export class NotFoundError extends Error {
  constructor() {
    super('Not Found');
  }
}

export class NotImplementedError extends Error {}

export class WebsocketServiceError extends Error {
  constructor() {
    super('Websocket Service Error');
  }
}

export class MalformedJSONError extends Error {
  constructor() {
    super('Malformed JSON Error');
  }
}
