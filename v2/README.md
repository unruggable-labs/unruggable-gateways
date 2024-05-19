# Components

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

# Todo

* GatewayRequest (ts, sol) need camelCase API with overloads
* Gateway (ts) convert from EZCCIP to Chainlink
* Contracts (sol) need camelCase API
* Test framework
	* blocksmith?

# Tests

* `bun src/SmartCache.test.ts`
* `bun src/vm.test.ts`
