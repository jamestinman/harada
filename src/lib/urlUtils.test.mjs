import test from 'node:test';
import assert from 'node:assert/strict';
import {
	sanitizeUrlInput,
	normalizeUrl,
	parseStandaloneUrl,
	isTodoBookmark
} from './urlUtils.js';

test('sanitizeUrlInput strips characters that are not URL-safe', () => {
	assert.equal(sanitizeUrlInput('https://example.com/path?q=1&x=y'), 'https://example.com/path?q=1&x=y');
	assert.equal(sanitizeUrlInput('hello world!'), 'helloworld');
});

test('normalizeUrl adds https and returns canonical href', () => {
	assert.equal(normalizeUrl('example.com/article'), 'https://example.com/article');
	assert.equal(normalizeUrl('https://example.com/article'), 'https://example.com/article');
	assert.equal(normalizeUrl('not a url'), null);
	assert.equal(normalizeUrl('POSSIBILITIES'), null);
	assert.equal(normalizeUrl('possibilities'), null);
	assert.equal(normalizeUrl('localhost:3000'), 'https://localhost:3000/');
	assert.equal(normalizeUrl('https://possibilities/'), 'https://possibilities/');
});

test('parseStandaloneUrl only accepts a single URL token', () => {
	assert.equal(parseStandaloneUrl('https://example.com'), 'https://example.com/');
	assert.equal(parseStandaloneUrl('example.com/read'), 'https://example.com/read');
	assert.equal(parseStandaloneUrl('Read https://example.com'), null);
	assert.equal(parseStandaloneUrl('https://example.com extra'), null);
	assert.equal(parseStandaloneUrl('POSSIBILITIES'), null);
});

test('isTodoBookmark detects linked urls and bare-url titles', () => {
	assert.equal(isTodoBookmark({ title: 'Read this', url: 'https://example.com' }), true);
	assert.equal(isTodoBookmark({ title: 'https://example.com/a', url: '' }), true);
	assert.equal(isTodoBookmark({ title: 'Buy milk', url: '' }), false);
	assert.equal(isTodoBookmark(null), false);
});
