import XMLHttpRequest from '../../../lib/xmlhttprequest';
import { assert } from 'chai';
import { createSandbox } from '../../../lib/sandbox';
import nock from 'nock';
import sinon from 'sinon';

suite('XMLHttpRequest#send', function() {
  let request;

  setup(function() {
    request = new XMLHttpRequest();
  });

  teardown(function() {
    nock.cleanAll();
  });

  test('should sandbox request if provided', function() {
    nock('http://127.0.0.1:1337').get('/');

    request.open('GET', 'http://127.0.0.1:1337', true);
    let sandbox = createSandbox();
    request.sandbox = sandbox;
    let spy = sinon.spy(request, 'abort');
    request.send();
    sandbox.abort();
    sinon.assert.calledOnce(spy);
  });

  test('should send data if provided', async function() {
    nock('http://127.0.0.1:1337')
      .post('/', 'zippity-doo-dah')
      .reply(200, 'zip-a-dee-a');

    request.open('POST', 'http://127.0.0.1:1337', true);
    let responseText = await request.send('zippity-doo-dah');
    assert.strictEqual(responseText, 'zip-a-dee-a');
  });

  test('should reject with statusText if status >=400', async function() {
    nock('http://127.0.0.1:1337')
      .get('/')
      .reply(500, '500 Internal Server Error');

    request.open('GET', 'http://127.0.0.1:1337', true);
    try {
      await request.send();
      assert.fail('Did not reject promise on xhr error.');
    } catch (error) {
      assert.instanceOf(error, Error);
    };
  });

  test('should reject with timeout error on timeout', async function() {
    nock('http://127.0.0.1:1337')
      .get('/')
      .delay(2)
      .reply(200, '200 OK');

    request.timeout = 1;
    request.open('GET', 'http://127.0.0.1:1337', true);
    try {
      await request.send();
      assert.fail('Did not reject promise on timeout.');
    } catch (error) {
      assert.instanceOf(error, Error);
    }
  });

  test('should resolve with responseText if everything ok', async function() {
    nock('http://127.0.0.1:1337')
      .get('/')
      .reply(200, '200 OK');

    request.open('GET', 'http://127.0.0.1:1337', true);
    let responseText = await request.send();
    assert.strictEqual(responseText.trim(), '200 OK');
  });
});
