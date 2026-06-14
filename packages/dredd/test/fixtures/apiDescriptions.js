export default [
  {
    content:
      'openapi: "3.0.0"\ninfo:\n  title: Machines API\n  version: "1.0"\npaths:\n  /machines:\n    get:\n      summary: Get Machines\n      responses:\n        "200":\n          description: OK\n          content:\n            "application/json; charset=utf-8":\n              example:\n                - type: bulldozer\n                  name: willy\n',
    location: './test/fixtures/single-get.yaml',
    annotations: [],
  },
];
