import 'reflect-metadata';
import { parseClientSeedConfig } from './client-seed-config.js';

describe('parseClientSeedConfig', () => {
  const firstClientId = '00000000-0000-4000-8000-000000000001';
  const secondClientId = '00000000-0000-4000-8000-000000000002';

  it('parses multiple clients and validates their origins against CORS', () => {
    const clients = parseClientSeedConfig(
      JSON.stringify([
        {
          id: firstClientId,
          name: 'First App',
          origins: ['https://first.example'],
        },
        {
          id: secondClientId,
          name: 'Second App',
          origins: ['https://second.example', 'http://localhost:5174'],
        },
      ]),
      'https://first.example, https://second.example,http://localhost:5174',
    );

    expect(clients).toEqual([
      {
        id: firstClientId,
        name: 'First App',
        origins: ['https://first.example'],
      },
      {
        id: secondClientId,
        name: 'Second App',
        origins: ['https://second.example', 'http://localhost:5174'],
      },
    ]);
  });

  it.each([
    [undefined, 'https://app.example'],
    ['{}', 'https://app.example'],
    ['not-json', 'https://app.example'],
    [
      JSON.stringify([
        { id: 'bad', name: 'App', origins: ['https://app.example'] },
      ]),
      'https://app.example',
    ],
    [
      JSON.stringify([{ id: firstClientId, name: 'App', origins: [] }]),
      'https://app.example',
    ],
    [
      JSON.stringify([
        {
          id: firstClientId,
          name: 'App',
          origins: ['https://app.example/path'],
        },
      ]),
      'https://app.example/path',
    ],
    [
      JSON.stringify([
        { id: firstClientId, name: 'App', origins: ['https://app.example'] },
      ]),
      'https://other.example',
    ],
  ])('rejects invalid seed config: %p', (json, corsOrigins) => {
    expect(() => parseClientSeedConfig(json, corsOrigins)).toThrow();
  });

  it('rejects duplicate client IDs', () => {
    const client = {
      id: firstClientId,
      name: 'App',
      origins: ['https://app.example'],
    };

    expect(() =>
      parseClientSeedConfig(
        JSON.stringify([client, client]),
        'https://app.example',
      ),
    ).toThrow('duplicate client id');
  });

  it('rejects duplicate origins within one client', () => {
    expect(() =>
      parseClientSeedConfig(
        JSON.stringify([
          {
            id: firstClientId,
            name: 'App',
            origins: ['https://app.example', 'https://app.example'],
          },
        ]),
        'https://app.example',
      ),
    ).toThrow('contains duplicate origins');
  });
});
