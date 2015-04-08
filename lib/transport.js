import XMLHttpRequest from './xmlhttprequest';
import querystring from 'querystring';

export class Transport {
  /**
   * @param {dav.Credentials} credentials user authorization.
   */
  constructor(credentials) {
    this.credentials = credentials || null;
  }

  /**
   * @param {dav.Request} request object with request info.
   * @return {Promise} a promise that will be resolved with an xhr request after
   *     its readyState is 4 or the result of applying an optional request
   *     `transformResponse` function to the xhr object after its readyState is 4.
   *
   * Options:
   *
   *   (Object) sandbox - optional request sandbox.
   */
  async send() {}
}

export class Basic extends Transport {
  /**
   * @param {dav.Credentials} credentials user authorization.
   */
  constructor(credentials) {
    super(credentials);
  }

  async send(request, url, options) {
    let sandbox = options && options.sandbox;
    let transformRequest = request.transformRequest;
    let transformResponse = request.transformResponse;
    let onerror = request.onerror;

    let xhr = new XMLHttpRequest();
    if (sandbox) sandbox.add(xhr);
    xhr.open(
      request.method,
      url,
      true /* async */,
      this.credentials.username,
      this.credentials.password
    );

    if (transformRequest) transformRequest(xhr);

    let result;
    try {
      await xhr.send(request.requestData);
      result = transformResponse ? transformResponse(xhr) : xhr;
    } catch (error) {
      if (onerror) onerror(error);
      throw error;
    }

    return result;
  }
}

/**
 * @param {dav.Credentials} credentials user authorization.
 */
export class OAuth2 extends Transport {
  constructor(credentials) {
    super(credentials);
  }

  async send(request, url, options={}) {
    let sandbox = options.sandbox;
    let transformRequest = request.transformRequest;
    let transformResponse = request.transformResponse;
    let onerror = request.onerror;

    if (!('retry' in options)) options.retry = true;

    let result, xhr;
    try {
      let token = await access(this.credentials, options);
      xhr = new XMLHttpRequest();
      if (sandbox) sandbox.add(xhr);
      xhr.open(request.method, url, true /* async */);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (transformRequest) transformRequest(xhr);
      await xhr.send(request.requestData);
      result = transformResponse ? transformResponse(xhr) : xhr;
    } catch (error) {
      if (options.retry && xhr.status === 401) {
        // Force expiration.
        this.credentials.expiration = 0;
        // Retry once at most.
        options.retry = false;
        return this.send(request, url, options);
      }

      if (onerror) onerror(error);
      throw error;
    }

    return result;
  }
}

/**
 * @return {Promise} promise that will resolve with access token.
 */
async function access(credentials, options) {
  if (!credentials.accessToken) {
    return await getAccessToken(credentials, options);
  }

  if (credentials.refreshToken && isExpired(credentials)) {
    return await refreshAccessToken(credentials, options);
  }

  return Promise.resolve(credentials.accessToken);
}

function isExpired(credentials) {
  return typeof credentials.expiration === 'number' &&
         Date.now() > credentials.expiration;
}

async function getAccessToken(credentials, options) {
  let sandbox = options.sandbox;
  let xhr = new XMLHttpRequest();
  if (sandbox) sandbox.add(xhr);
  xhr.open('POST', credentials.tokenUrl, true /* async */);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

  let data = querystring.stringify({
    code: credentials.authorizationCode,
    redirect_uri: credentials.redirectUrl,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'authorization_code'
  });

  let now = Date.now();
  await xhr.send(data);
  let response = JSON.parse(xhr.responseText);
  credentials.accessToken = response.access_token;
  credentials.refreshToken = 'refresh_token' in response ?
    response.refresh_token :
    null;
  credentials.expiration = 'expires_in' in response ?
    now + response.expires_in :
    null;

  return response.access_token;
}

async function refreshAccessToken(credentials, options) {
  let sandbox = options.sandbox;
  let xhr = new XMLHttpRequest();
  if (sandbox) sandbox.add(xhr);
  xhr.open('POST', credentials.tokenUrl, true /* async */);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

  let data = querystring.stringify({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: 'refresh_token'
  });

  let now = Date.now();
  await xhr.send(data);
  let response = JSON.parse(xhr.responseText);
  credentials.accessToken = response.access_token;
  credentials.expiration = 'expires_in' in response ?
    now + response.expires_in :
    null;

  return response.access_token;
}