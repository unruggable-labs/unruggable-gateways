# EVMGateway (v2)

## Setup

1. `git clone --recurse-submodules $REPO`
1. `foundryup`
1. `npm i`
1. create [`.env`](./.env.example)

## Notes

* You can run any `.test.ts` file with `bun file.test.ts`


## Test

* `bun src/SmartCache.test.ts`
* `bun src/vm.test.ts`

---

### Todo

* GatewayRequest (ts, sol) need camelCase API with overloads
* Gateway (ts) convert from EZCCIP to Chainlink
* Contracts (sol) need camelCase API
* Test framework
	* blocksmith?


### Components

* `ts`
	* GatewayRequest
	* VirtualMachine
	* Gateway	
		* SmartCache
	* Gateway Implementations
		* arb
		* op
* `sol`
	* Verifiers (IEVMVerifier)
		* arb 
		* op
	* Builder (Fetcher + Request)
	* Target (Helper + Request)
