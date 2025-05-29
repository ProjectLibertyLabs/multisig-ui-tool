export async function setupPolkadotExtensionMock() {
  // Return the mock function
  return function injectExtension() {
    window.injectedWeb3 = {
      "polkadot-js": {
        version: "0.44.1",
        connect: (originName) => {
          console.log(`Extension connected for ${originName}`);

          const accounts = {
            "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY": {
              address: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
              name: "Alice",
              type: "sr25519",
              uri: "//Alice",
            },
            "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty": {
              address: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
              name: "Bob",
              type: "sr25519",
              uri: "//Bob",
            },
            "5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y": {
              address: "5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y",
              name: "Charlie",
              type: "sr25519",
              uri: "//Charlie",
            },
          };

          const payloadToMsg = async (payload) => {
            const { WsProvider, ApiPromise } = await import("https://cdn.jsdelivr.net/npm/@polkadot/api@16.0.1/+esm");

            const PROVIDER_URI = "ws://localhost:9944";
            const api = await ApiPromise.create({ provider: new WsProvider(PROVIDER_URI), throwOnConnect: true });
            return api.registry.createType("ExtrinsicPayload", payload, { version: payload.version });
          };

          return {
            name: "MOCK polkadot-js",
            version: "0.44.1",
            accounts: {
              get: () => Object.values(accounts),
            },
            signer: {
              signPayload: async (payload) => {
                console.log("MOCK injectedWeb3: signer.signPayload", payload);
                const { Keyring } = await import("https://cdn.jsdelivr.net/npm/@polkadot/keyring@13.5.1/+esm");

                const account = accounts[payload.address];
                if (!account) throw new Error(`No key for ${payload.address}`);

                const keyring = new Keyring({ type: "sr25519" });
                const key = keyring.addFromUri(account.uri);
                const message = await payloadToMsg(payload);
                const signed = message.sign(key);
                return {
                  id: 1,
                  signature: signed.signature,
                };
              },
              signRaw: async (payload) => {
                console.log("MOCK injectedWeb3: signer.signRaw", payload);
                const { stringToU8a, u8aToHex } = await import(
                  "https://cdn.jsdelivr.net/npm/@polkadot/util@13.5.1/+esm"
                );
                const { Keyring } = await import("https://cdn.jsdelivr.net/npm/@polkadot/keyring@13.5.1/+esm");

                const account = accounts[payload.address];
                if (!account) throw new Error(`No key for ${payload.address}`);

                const keyring = new Keyring({ type: "sr25519" });
                const key = keyring.addFromUri(account.uri);
                const message = stringToU8a(payload.data);
                const signature = key.sign(message);

                return {
                  id: 1,
                  signature: u8aToHex(signature),
                };
              },
            },
          };
        },
      },
    };
  };
}
