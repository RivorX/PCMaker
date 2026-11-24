# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `default`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*ListComponents*](#listcomponents)
  - [*ListCatalogPage*](#listcatalogpage)
  - [*GetComponentById*](#getcomponentbyid)
  - [*ListServiceTypes*](#listservicetypes)
  - [*ListServiceTickets*](#listservicetickets)
  - [*GetServiceTicketById*](#getserviceticketbyid)
  - [*ListPublicConfigurations*](#listpublicconfigurations)
  - [*ListUserSavedPcConfigurations*](#listusersavedpcconfigurations)
  - [*GetSavedPcConfiguration*](#getsavedpcconfiguration)
  - [*GetUserByEmail*](#getuserbyemail)
  - [*GetAuthTokenByHash*](#getauthtokenbyhash)
- [**Mutations**](#mutations)
  - [*CreateUser*](#createuser)
  - [*CreateServiceTicket*](#createserviceticket)
  - [*AddTicketComment*](#addticketcomment)
  - [*CreatePcConfiguration*](#createpcconfiguration)
  - [*CreateSavedPcConfiguration*](#createsavedpcconfiguration)
  - [*UpdateSavedPcConfiguration*](#updatesavedpcconfiguration)
  - [*DeleteSavedPcConfiguration*](#deletesavedpcconfiguration)
  - [*AddConfigurationComponent*](#addconfigurationcomponent)
  - [*CreateAuthToken*](#createauthtoken)
  - [*MarkAuthTokenUsed*](#markauthtokenused)
  - [*ActivateUser*](#activateuser)
  - [*UpdateUserPassword*](#updateuserpassword)
  - [*DeleteUserByEmail*](#deleteuserbyemail)
  - [*InvalidateUserAuthTokens*](#invalidateuserauthtokens)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `default`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@pcmaker/dataconnect` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@pcmaker/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@pcmaker/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `default` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## ListComponents
You can execute the `ListComponents` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listComponents(vars?: ListComponentsVariables, options?: ExecuteQueryOptions): QueryPromise<ListComponentsData, ListComponentsVariables>;

interface ListComponentsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListComponentsVariables): QueryRef<ListComponentsData, ListComponentsVariables>;
}
export const listComponentsRef: ListComponentsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listComponents(dc: DataConnect, vars?: ListComponentsVariables, options?: ExecuteQueryOptions): QueryPromise<ListComponentsData, ListComponentsVariables>;

interface ListComponentsRef {
  ...
  (dc: DataConnect, vars?: ListComponentsVariables): QueryRef<ListComponentsData, ListComponentsVariables>;
}
export const listComponentsRef: ListComponentsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listComponentsRef:
```typescript
const name = listComponentsRef.operationName;
console.log(name);
```

### Variables
The `ListComponents` query has an optional argument of type `ListComponentsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ListComponentsVariables {
  type?: string | null;
}
```
### Return Type
Recall that executing the `ListComponents` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListComponentsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListComponentsData {
  components: ({
    id: UUIDString;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    componentType: string;
    description?: string | null;
    price?: number | null;
    performanceScore?: number | null;
    productUrl?: string | null;
    specifications: ({
      id: UUIDString;
      specificationName: string;
      specificationValue: string;
    } & ComponentSpecification_Key)[];
  } & Component_Key)[];
}
```
### Using `ListComponents`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listComponents, ListComponentsVariables } from '@pcmaker/dataconnect';

// The `ListComponents` query has an optional argument of type `ListComponentsVariables`:
const listComponentsVars: ListComponentsVariables = {
  type: ..., // optional
};

// Call the `listComponents()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listComponents(listComponentsVars);
// Variables can be defined inline as well.
const { data } = await listComponents({ type: ..., });
// Since all variables are optional for this query, you can omit the `ListComponentsVariables` argument.
const { data } = await listComponents();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listComponents(dataConnect, listComponentsVars);

console.log(data.components);

// Or, you can use the `Promise` API.
listComponents(listComponentsVars).then((response) => {
  const data = response.data;
  console.log(data.components);
});
```

### Using `ListComponents`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listComponentsRef, ListComponentsVariables } from '@pcmaker/dataconnect';

// The `ListComponents` query has an optional argument of type `ListComponentsVariables`:
const listComponentsVars: ListComponentsVariables = {
  type: ..., // optional
};

// Call the `listComponentsRef()` function to get a reference to the query.
const ref = listComponentsRef(listComponentsVars);
// Variables can be defined inline as well.
const ref = listComponentsRef({ type: ..., });
// Since all variables are optional for this query, you can omit the `ListComponentsVariables` argument.
const ref = listComponentsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listComponentsRef(dataConnect, listComponentsVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.components);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.components);
});
```

## ListCatalogPage
You can execute the `ListCatalogPage` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listCatalogPage(vars: ListCatalogPageVariables, options?: ExecuteQueryOptions): QueryPromise<ListCatalogPageData, ListCatalogPageVariables>;

interface ListCatalogPageRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListCatalogPageVariables): QueryRef<ListCatalogPageData, ListCatalogPageVariables>;
}
export const listCatalogPageRef: ListCatalogPageRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listCatalogPage(dc: DataConnect, vars: ListCatalogPageVariables, options?: ExecuteQueryOptions): QueryPromise<ListCatalogPageData, ListCatalogPageVariables>;

interface ListCatalogPageRef {
  ...
  (dc: DataConnect, vars: ListCatalogPageVariables): QueryRef<ListCatalogPageData, ListCatalogPageVariables>;
}
export const listCatalogPageRef: ListCatalogPageRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listCatalogPageRef:
```typescript
const name = listCatalogPageRef.operationName;
console.log(name);
```

### Variables
The `ListCatalogPage` query requires an argument of type `ListCatalogPageVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ListCatalogPageVariables {
  offset: number;
}
```
### Return Type
Recall that executing the `ListCatalogPage` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListCatalogPageData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListCatalogPageData {
  components: ({
    id: UUIDString;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    componentType: string;
    description?: string | null;
    price?: number | null;
    performanceScore?: number | null;
    productUrl?: string | null;
    specifications: ({
      id: UUIDString;
      specificationName: string;
      specificationValue: string;
    } & ComponentSpecification_Key)[];
  } & Component_Key)[];
}
```
### Using `ListCatalogPage`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listCatalogPage, ListCatalogPageVariables } from '@pcmaker/dataconnect';

// The `ListCatalogPage` query requires an argument of type `ListCatalogPageVariables`:
const listCatalogPageVars: ListCatalogPageVariables = {
  offset: ..., 
};

// Call the `listCatalogPage()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listCatalogPage(listCatalogPageVars);
// Variables can be defined inline as well.
const { data } = await listCatalogPage({ offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listCatalogPage(dataConnect, listCatalogPageVars);

console.log(data.components);

// Or, you can use the `Promise` API.
listCatalogPage(listCatalogPageVars).then((response) => {
  const data = response.data;
  console.log(data.components);
});
```

### Using `ListCatalogPage`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listCatalogPageRef, ListCatalogPageVariables } from '@pcmaker/dataconnect';

// The `ListCatalogPage` query requires an argument of type `ListCatalogPageVariables`:
const listCatalogPageVars: ListCatalogPageVariables = {
  offset: ..., 
};

// Call the `listCatalogPageRef()` function to get a reference to the query.
const ref = listCatalogPageRef(listCatalogPageVars);
// Variables can be defined inline as well.
const ref = listCatalogPageRef({ offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listCatalogPageRef(dataConnect, listCatalogPageVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.components);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.components);
});
```

## GetComponentById
You can execute the `GetComponentById` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getComponentById(vars: GetComponentByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetComponentByIdData, GetComponentByIdVariables>;

interface GetComponentByIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetComponentByIdVariables): QueryRef<GetComponentByIdData, GetComponentByIdVariables>;
}
export const getComponentByIdRef: GetComponentByIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getComponentById(dc: DataConnect, vars: GetComponentByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetComponentByIdData, GetComponentByIdVariables>;

interface GetComponentByIdRef {
  ...
  (dc: DataConnect, vars: GetComponentByIdVariables): QueryRef<GetComponentByIdData, GetComponentByIdVariables>;
}
export const getComponentByIdRef: GetComponentByIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getComponentByIdRef:
```typescript
const name = getComponentByIdRef.operationName;
console.log(name);
```

### Variables
The `GetComponentById` query requires an argument of type `GetComponentByIdVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetComponentByIdVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `GetComponentById` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetComponentByIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetComponentByIdData {
  component?: {
    id: UUIDString;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    componentType: string;
    description?: string | null;
    price?: number | null;
    performanceScore?: number | null;
    productUrl?: string | null;
    specifications: ({
      id: UUIDString;
      specificationName: string;
      specificationValue: string;
    } & ComponentSpecification_Key)[];
  } & Component_Key;
}
```
### Using `GetComponentById`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getComponentById, GetComponentByIdVariables } from '@pcmaker/dataconnect';

// The `GetComponentById` query requires an argument of type `GetComponentByIdVariables`:
const getComponentByIdVars: GetComponentByIdVariables = {
  id: ..., 
};

// Call the `getComponentById()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getComponentById(getComponentByIdVars);
// Variables can be defined inline as well.
const { data } = await getComponentById({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getComponentById(dataConnect, getComponentByIdVars);

console.log(data.component);

// Or, you can use the `Promise` API.
getComponentById(getComponentByIdVars).then((response) => {
  const data = response.data;
  console.log(data.component);
});
```

### Using `GetComponentById`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getComponentByIdRef, GetComponentByIdVariables } from '@pcmaker/dataconnect';

// The `GetComponentById` query requires an argument of type `GetComponentByIdVariables`:
const getComponentByIdVars: GetComponentByIdVariables = {
  id: ..., 
};

// Call the `getComponentByIdRef()` function to get a reference to the query.
const ref = getComponentByIdRef(getComponentByIdVars);
// Variables can be defined inline as well.
const ref = getComponentByIdRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getComponentByIdRef(dataConnect, getComponentByIdVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.component);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.component);
});
```

## ListServiceTypes
You can execute the `ListServiceTypes` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listServiceTypes(options?: ExecuteQueryOptions): QueryPromise<ListServiceTypesData, undefined>;

interface ListServiceTypesRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListServiceTypesData, undefined>;
}
export const listServiceTypesRef: ListServiceTypesRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listServiceTypes(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListServiceTypesData, undefined>;

interface ListServiceTypesRef {
  ...
  (dc: DataConnect): QueryRef<ListServiceTypesData, undefined>;
}
export const listServiceTypesRef: ListServiceTypesRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listServiceTypesRef:
```typescript
const name = listServiceTypesRef.operationName;
console.log(name);
```

### Variables
The `ListServiceTypes` query has no variables.
### Return Type
Recall that executing the `ListServiceTypes` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListServiceTypesData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListServiceTypesData {
  serviceTypes: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    basePrice: number;
    completionDate?: DateString | null;
  } & ServiceType_Key)[];
}
```
### Using `ListServiceTypes`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listServiceTypes } from '@pcmaker/dataconnect';


// Call the `listServiceTypes()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listServiceTypes();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listServiceTypes(dataConnect);

console.log(data.serviceTypes);

// Or, you can use the `Promise` API.
listServiceTypes().then((response) => {
  const data = response.data;
  console.log(data.serviceTypes);
});
```

### Using `ListServiceTypes`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listServiceTypesRef } from '@pcmaker/dataconnect';


// Call the `listServiceTypesRef()` function to get a reference to the query.
const ref = listServiceTypesRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listServiceTypesRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.serviceTypes);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.serviceTypes);
});
```

## ListServiceTickets
You can execute the `ListServiceTickets` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listServiceTickets(options?: ExecuteQueryOptions): QueryPromise<ListServiceTicketsData, undefined>;

interface ListServiceTicketsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListServiceTicketsData, undefined>;
}
export const listServiceTicketsRef: ListServiceTicketsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listServiceTickets(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListServiceTicketsData, undefined>;

interface ListServiceTicketsRef {
  ...
  (dc: DataConnect): QueryRef<ListServiceTicketsData, undefined>;
}
export const listServiceTicketsRef: ListServiceTicketsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listServiceTicketsRef:
```typescript
const name = listServiceTicketsRef.operationName;
console.log(name);
```

### Variables
The `ListServiceTickets` query has no variables.
### Return Type
Recall that executing the `ListServiceTickets` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListServiceTicketsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListServiceTicketsData {
  serviceTickets: ({
    id: UUIDString;
    ticketNumber: string;
    title: string;
    description: string;
    deviceName?: string | null;
    deviceSerialNumber?: string | null;
    priority: TicketPriority;
    status: TicketStatus;
    estimatedCost?: number | null;
    finalCost?: number | null;
    createdAt: TimestampString;
  } & ServiceTicket_Key)[];
}
```
### Using `ListServiceTickets`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listServiceTickets } from '@pcmaker/dataconnect';


// Call the `listServiceTickets()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listServiceTickets();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listServiceTickets(dataConnect);

console.log(data.serviceTickets);

// Or, you can use the `Promise` API.
listServiceTickets().then((response) => {
  const data = response.data;
  console.log(data.serviceTickets);
});
```

### Using `ListServiceTickets`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listServiceTicketsRef } from '@pcmaker/dataconnect';


// Call the `listServiceTicketsRef()` function to get a reference to the query.
const ref = listServiceTicketsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listServiceTicketsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.serviceTickets);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.serviceTickets);
});
```

## GetServiceTicketById
You can execute the `GetServiceTicketById` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getServiceTicketById(vars: GetServiceTicketByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;

interface GetServiceTicketByIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetServiceTicketByIdVariables): QueryRef<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;
}
export const getServiceTicketByIdRef: GetServiceTicketByIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getServiceTicketById(dc: DataConnect, vars: GetServiceTicketByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;

interface GetServiceTicketByIdRef {
  ...
  (dc: DataConnect, vars: GetServiceTicketByIdVariables): QueryRef<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;
}
export const getServiceTicketByIdRef: GetServiceTicketByIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getServiceTicketByIdRef:
```typescript
const name = getServiceTicketByIdRef.operationName;
console.log(name);
```

### Variables
The `GetServiceTicketById` query requires an argument of type `GetServiceTicketByIdVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetServiceTicketByIdVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `GetServiceTicketById` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetServiceTicketByIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetServiceTicketByIdData {
  serviceTicket?: {
    id: UUIDString;
    ticketNumber: string;
    title: string;
    description: string;
    deviceName?: string | null;
    deviceSerialNumber?: string | null;
    priority: TicketPriority;
    status: TicketStatus;
    estimatedCost?: number | null;
    finalCost?: number | null;
    createdAt: TimestampString;
    updatedAt?: TimestampString | null;
    completedAt?: TimestampString | null;
  } & ServiceTicket_Key;
}
```
### Using `GetServiceTicketById`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getServiceTicketById, GetServiceTicketByIdVariables } from '@pcmaker/dataconnect';

// The `GetServiceTicketById` query requires an argument of type `GetServiceTicketByIdVariables`:
const getServiceTicketByIdVars: GetServiceTicketByIdVariables = {
  id: ..., 
};

// Call the `getServiceTicketById()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getServiceTicketById(getServiceTicketByIdVars);
// Variables can be defined inline as well.
const { data } = await getServiceTicketById({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getServiceTicketById(dataConnect, getServiceTicketByIdVars);

console.log(data.serviceTicket);

// Or, you can use the `Promise` API.
getServiceTicketById(getServiceTicketByIdVars).then((response) => {
  const data = response.data;
  console.log(data.serviceTicket);
});
```

### Using `GetServiceTicketById`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getServiceTicketByIdRef, GetServiceTicketByIdVariables } from '@pcmaker/dataconnect';

// The `GetServiceTicketById` query requires an argument of type `GetServiceTicketByIdVariables`:
const getServiceTicketByIdVars: GetServiceTicketByIdVariables = {
  id: ..., 
};

// Call the `getServiceTicketByIdRef()` function to get a reference to the query.
const ref = getServiceTicketByIdRef(getServiceTicketByIdVars);
// Variables can be defined inline as well.
const ref = getServiceTicketByIdRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getServiceTicketByIdRef(dataConnect, getServiceTicketByIdVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.serviceTicket);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.serviceTicket);
});
```

## ListPublicConfigurations
You can execute the `ListPublicConfigurations` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listPublicConfigurations(options?: ExecuteQueryOptions): QueryPromise<ListPublicConfigurationsData, undefined>;

interface ListPublicConfigurationsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListPublicConfigurationsData, undefined>;
}
export const listPublicConfigurationsRef: ListPublicConfigurationsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listPublicConfigurations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListPublicConfigurationsData, undefined>;

interface ListPublicConfigurationsRef {
  ...
  (dc: DataConnect): QueryRef<ListPublicConfigurationsData, undefined>;
}
export const listPublicConfigurationsRef: ListPublicConfigurationsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listPublicConfigurationsRef:
```typescript
const name = listPublicConfigurationsRef.operationName;
console.log(name);
```

### Variables
The `ListPublicConfigurations` query has no variables.
### Return Type
Recall that executing the `ListPublicConfigurations` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListPublicConfigurationsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListPublicConfigurationsData {
  pcConfigurations: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    totalPrice: number;
    estimatedPerformance?: number | null;
    createdAt: TimestampString;
  } & PcConfiguration_Key)[];
}
```
### Using `ListPublicConfigurations`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listPublicConfigurations } from '@pcmaker/dataconnect';


// Call the `listPublicConfigurations()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listPublicConfigurations();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listPublicConfigurations(dataConnect);

console.log(data.pcConfigurations);

// Or, you can use the `Promise` API.
listPublicConfigurations().then((response) => {
  const data = response.data;
  console.log(data.pcConfigurations);
});
```

### Using `ListPublicConfigurations`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listPublicConfigurationsRef } from '@pcmaker/dataconnect';


// Call the `listPublicConfigurationsRef()` function to get a reference to the query.
const ref = listPublicConfigurationsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listPublicConfigurationsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.pcConfigurations);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.pcConfigurations);
});
```

## ListUserSavedPcConfigurations
You can execute the `ListUserSavedPcConfigurations` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listUserSavedPcConfigurations(vars: ListUserSavedPcConfigurationsVariables, options?: ExecuteQueryOptions): QueryPromise<ListUserSavedPcConfigurationsData, ListUserSavedPcConfigurationsVariables>;

interface ListUserSavedPcConfigurationsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListUserSavedPcConfigurationsVariables): QueryRef<ListUserSavedPcConfigurationsData, ListUserSavedPcConfigurationsVariables>;
}
export const listUserSavedPcConfigurationsRef: ListUserSavedPcConfigurationsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listUserSavedPcConfigurations(dc: DataConnect, vars: ListUserSavedPcConfigurationsVariables, options?: ExecuteQueryOptions): QueryPromise<ListUserSavedPcConfigurationsData, ListUserSavedPcConfigurationsVariables>;

interface ListUserSavedPcConfigurationsRef {
  ...
  (dc: DataConnect, vars: ListUserSavedPcConfigurationsVariables): QueryRef<ListUserSavedPcConfigurationsData, ListUserSavedPcConfigurationsVariables>;
}
export const listUserSavedPcConfigurationsRef: ListUserSavedPcConfigurationsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listUserSavedPcConfigurationsRef:
```typescript
const name = listUserSavedPcConfigurationsRef.operationName;
console.log(name);
```

### Variables
The `ListUserSavedPcConfigurations` query requires an argument of type `ListUserSavedPcConfigurationsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ListUserSavedPcConfigurationsVariables {
  userId: UUIDString;
  offset?: number | null;
}
```
### Return Type
Recall that executing the `ListUserSavedPcConfigurations` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListUserSavedPcConfigurationsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListUserSavedPcConfigurationsData {
  pcConfigurations: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    totalPrice: number;
    savedSnapshot?: unknown | null;
    createdAt: TimestampString;
    updatedAt?: TimestampString | null;
  } & PcConfiguration_Key)[];
}
```
### Using `ListUserSavedPcConfigurations`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listUserSavedPcConfigurations, ListUserSavedPcConfigurationsVariables } from '@pcmaker/dataconnect';

// The `ListUserSavedPcConfigurations` query requires an argument of type `ListUserSavedPcConfigurationsVariables`:
const listUserSavedPcConfigurationsVars: ListUserSavedPcConfigurationsVariables = {
  userId: ..., 
  offset: ..., // optional
};

// Call the `listUserSavedPcConfigurations()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listUserSavedPcConfigurations(listUserSavedPcConfigurationsVars);
// Variables can be defined inline as well.
const { data } = await listUserSavedPcConfigurations({ userId: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listUserSavedPcConfigurations(dataConnect, listUserSavedPcConfigurationsVars);

console.log(data.pcConfigurations);

// Or, you can use the `Promise` API.
listUserSavedPcConfigurations(listUserSavedPcConfigurationsVars).then((response) => {
  const data = response.data;
  console.log(data.pcConfigurations);
});
```

### Using `ListUserSavedPcConfigurations`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listUserSavedPcConfigurationsRef, ListUserSavedPcConfigurationsVariables } from '@pcmaker/dataconnect';

// The `ListUserSavedPcConfigurations` query requires an argument of type `ListUserSavedPcConfigurationsVariables`:
const listUserSavedPcConfigurationsVars: ListUserSavedPcConfigurationsVariables = {
  userId: ..., 
  offset: ..., // optional
};

// Call the `listUserSavedPcConfigurationsRef()` function to get a reference to the query.
const ref = listUserSavedPcConfigurationsRef(listUserSavedPcConfigurationsVars);
// Variables can be defined inline as well.
const ref = listUserSavedPcConfigurationsRef({ userId: ..., offset: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listUserSavedPcConfigurationsRef(dataConnect, listUserSavedPcConfigurationsVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.pcConfigurations);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.pcConfigurations);
});
```

## GetSavedPcConfiguration
You can execute the `GetSavedPcConfiguration` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getSavedPcConfiguration(vars: GetSavedPcConfigurationVariables, options?: ExecuteQueryOptions): QueryPromise<GetSavedPcConfigurationData, GetSavedPcConfigurationVariables>;

interface GetSavedPcConfigurationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetSavedPcConfigurationVariables): QueryRef<GetSavedPcConfigurationData, GetSavedPcConfigurationVariables>;
}
export const getSavedPcConfigurationRef: GetSavedPcConfigurationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getSavedPcConfiguration(dc: DataConnect, vars: GetSavedPcConfigurationVariables, options?: ExecuteQueryOptions): QueryPromise<GetSavedPcConfigurationData, GetSavedPcConfigurationVariables>;

interface GetSavedPcConfigurationRef {
  ...
  (dc: DataConnect, vars: GetSavedPcConfigurationVariables): QueryRef<GetSavedPcConfigurationData, GetSavedPcConfigurationVariables>;
}
export const getSavedPcConfigurationRef: GetSavedPcConfigurationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getSavedPcConfigurationRef:
```typescript
const name = getSavedPcConfigurationRef.operationName;
console.log(name);
```

### Variables
The `GetSavedPcConfiguration` query requires an argument of type `GetSavedPcConfigurationVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetSavedPcConfigurationVariables {
  id: UUIDString;
  userId: UUIDString;
}
```
### Return Type
Recall that executing the `GetSavedPcConfiguration` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetSavedPcConfigurationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetSavedPcConfigurationData {
  pcConfigurations: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    totalPrice: number;
    savedSnapshot?: unknown | null;
    createdAt: TimestampString;
    updatedAt?: TimestampString | null;
  } & PcConfiguration_Key)[];
}
```
### Using `GetSavedPcConfiguration`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getSavedPcConfiguration, GetSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `GetSavedPcConfiguration` query requires an argument of type `GetSavedPcConfigurationVariables`:
const getSavedPcConfigurationVars: GetSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
};

// Call the `getSavedPcConfiguration()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getSavedPcConfiguration(getSavedPcConfigurationVars);
// Variables can be defined inline as well.
const { data } = await getSavedPcConfiguration({ id: ..., userId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getSavedPcConfiguration(dataConnect, getSavedPcConfigurationVars);

console.log(data.pcConfigurations);

// Or, you can use the `Promise` API.
getSavedPcConfiguration(getSavedPcConfigurationVars).then((response) => {
  const data = response.data;
  console.log(data.pcConfigurations);
});
```

### Using `GetSavedPcConfiguration`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getSavedPcConfigurationRef, GetSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `GetSavedPcConfiguration` query requires an argument of type `GetSavedPcConfigurationVariables`:
const getSavedPcConfigurationVars: GetSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
};

// Call the `getSavedPcConfigurationRef()` function to get a reference to the query.
const ref = getSavedPcConfigurationRef(getSavedPcConfigurationVars);
// Variables can be defined inline as well.
const ref = getSavedPcConfigurationRef({ id: ..., userId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getSavedPcConfigurationRef(dataConnect, getSavedPcConfigurationVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.pcConfigurations);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.pcConfigurations);
});
```

## GetUserByEmail
You can execute the `GetUserByEmail` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getUserByEmail(vars: GetUserByEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByEmailData, GetUserByEmailVariables>;

interface GetUserByEmailRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserByEmailVariables): QueryRef<GetUserByEmailData, GetUserByEmailVariables>;
}
export const getUserByEmailRef: GetUserByEmailRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getUserByEmail(dc: DataConnect, vars: GetUserByEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByEmailData, GetUserByEmailVariables>;

interface GetUserByEmailRef {
  ...
  (dc: DataConnect, vars: GetUserByEmailVariables): QueryRef<GetUserByEmailData, GetUserByEmailVariables>;
}
export const getUserByEmailRef: GetUserByEmailRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getUserByEmailRef:
```typescript
const name = getUserByEmailRef.operationName;
console.log(name);
```

### Variables
The `GetUserByEmail` query requires an argument of type `GetUserByEmailVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetUserByEmailVariables {
  email: string;
}
```
### Return Type
Recall that executing the `GetUserByEmail` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetUserByEmailData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetUserByEmailData {
  users: ({
    id: UUIDString;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: UserRole;
    isActive: boolean;
  } & User_Key)[];
}
```
### Using `GetUserByEmail`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getUserByEmail, GetUserByEmailVariables } from '@pcmaker/dataconnect';

// The `GetUserByEmail` query requires an argument of type `GetUserByEmailVariables`:
const getUserByEmailVars: GetUserByEmailVariables = {
  email: ..., 
};

// Call the `getUserByEmail()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getUserByEmail(getUserByEmailVars);
// Variables can be defined inline as well.
const { data } = await getUserByEmail({ email: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getUserByEmail(dataConnect, getUserByEmailVars);

console.log(data.users);

// Or, you can use the `Promise` API.
getUserByEmail(getUserByEmailVars).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

### Using `GetUserByEmail`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getUserByEmailRef, GetUserByEmailVariables } from '@pcmaker/dataconnect';

// The `GetUserByEmail` query requires an argument of type `GetUserByEmailVariables`:
const getUserByEmailVars: GetUserByEmailVariables = {
  email: ..., 
};

// Call the `getUserByEmailRef()` function to get a reference to the query.
const ref = getUserByEmailRef(getUserByEmailVars);
// Variables can be defined inline as well.
const ref = getUserByEmailRef({ email: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getUserByEmailRef(dataConnect, getUserByEmailVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.users);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

## GetAuthTokenByHash
You can execute the `GetAuthTokenByHash` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getAuthTokenByHash(vars: GetAuthTokenByHashVariables, options?: ExecuteQueryOptions): QueryPromise<GetAuthTokenByHashData, GetAuthTokenByHashVariables>;

interface GetAuthTokenByHashRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetAuthTokenByHashVariables): QueryRef<GetAuthTokenByHashData, GetAuthTokenByHashVariables>;
}
export const getAuthTokenByHashRef: GetAuthTokenByHashRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getAuthTokenByHash(dc: DataConnect, vars: GetAuthTokenByHashVariables, options?: ExecuteQueryOptions): QueryPromise<GetAuthTokenByHashData, GetAuthTokenByHashVariables>;

interface GetAuthTokenByHashRef {
  ...
  (dc: DataConnect, vars: GetAuthTokenByHashVariables): QueryRef<GetAuthTokenByHashData, GetAuthTokenByHashVariables>;
}
export const getAuthTokenByHashRef: GetAuthTokenByHashRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getAuthTokenByHashRef:
```typescript
const name = getAuthTokenByHashRef.operationName;
console.log(name);
```

### Variables
The `GetAuthTokenByHash` query requires an argument of type `GetAuthTokenByHashVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetAuthTokenByHashVariables {
  tokenHash: string;
  type: AuthTokenType;
}
```
### Return Type
Recall that executing the `GetAuthTokenByHash` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetAuthTokenByHashData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetAuthTokenByHashData {
  authTokens: ({
    id: UUIDString;
    tokenHash: string;
    type: AuthTokenType;
    expiresAt: TimestampString;
    usedAt?: TimestampString | null;
    user: {
      id: UUIDString;
      email: string;
      isActive: boolean;
    } & User_Key;
  } & AuthToken_Key)[];
}
```
### Using `GetAuthTokenByHash`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getAuthTokenByHash, GetAuthTokenByHashVariables } from '@pcmaker/dataconnect';

// The `GetAuthTokenByHash` query requires an argument of type `GetAuthTokenByHashVariables`:
const getAuthTokenByHashVars: GetAuthTokenByHashVariables = {
  tokenHash: ..., 
  type: ..., 
};

// Call the `getAuthTokenByHash()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getAuthTokenByHash(getAuthTokenByHashVars);
// Variables can be defined inline as well.
const { data } = await getAuthTokenByHash({ tokenHash: ..., type: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getAuthTokenByHash(dataConnect, getAuthTokenByHashVars);

console.log(data.authTokens);

// Or, you can use the `Promise` API.
getAuthTokenByHash(getAuthTokenByHashVars).then((response) => {
  const data = response.data;
  console.log(data.authTokens);
});
```

### Using `GetAuthTokenByHash`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getAuthTokenByHashRef, GetAuthTokenByHashVariables } from '@pcmaker/dataconnect';

// The `GetAuthTokenByHash` query requires an argument of type `GetAuthTokenByHashVariables`:
const getAuthTokenByHashVars: GetAuthTokenByHashVariables = {
  tokenHash: ..., 
  type: ..., 
};

// Call the `getAuthTokenByHashRef()` function to get a reference to the query.
const ref = getAuthTokenByHashRef(getAuthTokenByHashVars);
// Variables can be defined inline as well.
const ref = getAuthTokenByHashRef({ tokenHash: ..., type: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getAuthTokenByHashRef(dataConnect, getAuthTokenByHashVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.authTokens);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.authTokens);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `default` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateUser
You can execute the `CreateUser` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createUser(vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;

interface CreateUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
}
export const createUserRef: CreateUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createUser(dc: DataConnect, vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;

interface CreateUserRef {
  ...
  (dc: DataConnect, vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
}
export const createUserRef: CreateUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createUserRef:
```typescript
const name = createUserRef.operationName;
console.log(name);
```

### Variables
The `CreateUser` mutation requires an argument of type `CreateUserVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateUserVariables {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string | null;
}
```
### Return Type
Recall that executing the `CreateUser` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateUserData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateUserData {
  user_insert: User_Key;
}
```
### Using `CreateUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createUser, CreateUserVariables } from '@pcmaker/dataconnect';

// The `CreateUser` mutation requires an argument of type `CreateUserVariables`:
const createUserVars: CreateUserVariables = {
  firstName: ..., 
  lastName: ..., 
  email: ..., 
  password: ..., 
  phone: ..., // optional
};

// Call the `createUser()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createUser(createUserVars);
// Variables can be defined inline as well.
const { data } = await createUser({ firstName: ..., lastName: ..., email: ..., password: ..., phone: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createUser(dataConnect, createUserVars);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
createUser(createUserVars).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

### Using `CreateUser`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createUserRef, CreateUserVariables } from '@pcmaker/dataconnect';

// The `CreateUser` mutation requires an argument of type `CreateUserVariables`:
const createUserVars: CreateUserVariables = {
  firstName: ..., 
  lastName: ..., 
  email: ..., 
  password: ..., 
  phone: ..., // optional
};

// Call the `createUserRef()` function to get a reference to the mutation.
const ref = createUserRef(createUserVars);
// Variables can be defined inline as well.
const ref = createUserRef({ firstName: ..., lastName: ..., email: ..., password: ..., phone: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createUserRef(dataConnect, createUserVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

## CreateServiceTicket
You can execute the `CreateServiceTicket` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createServiceTicket(vars: CreateServiceTicketVariables): MutationPromise<CreateServiceTicketData, CreateServiceTicketVariables>;

interface CreateServiceTicketRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateServiceTicketVariables): MutationRef<CreateServiceTicketData, CreateServiceTicketVariables>;
}
export const createServiceTicketRef: CreateServiceTicketRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createServiceTicket(dc: DataConnect, vars: CreateServiceTicketVariables): MutationPromise<CreateServiceTicketData, CreateServiceTicketVariables>;

interface CreateServiceTicketRef {
  ...
  (dc: DataConnect, vars: CreateServiceTicketVariables): MutationRef<CreateServiceTicketData, CreateServiceTicketVariables>;
}
export const createServiceTicketRef: CreateServiceTicketRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createServiceTicketRef:
```typescript
const name = createServiceTicketRef.operationName;
console.log(name);
```

### Variables
The `CreateServiceTicket` mutation requires an argument of type `CreateServiceTicketVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateServiceTicketVariables {
  ticketNumber: string;
  clientId: UUIDString;
  serviceTypeId: UUIDString;
  title: string;
  description: string;
  deviceName?: string | null;
  deviceSerialNumber?: string | null;
  priority?: TicketPriority | null;
}
```
### Return Type
Recall that executing the `CreateServiceTicket` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateServiceTicketData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateServiceTicketData {
  serviceTicket_insert: ServiceTicket_Key;
}
```
### Using `CreateServiceTicket`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createServiceTicket, CreateServiceTicketVariables } from '@pcmaker/dataconnect';

// The `CreateServiceTicket` mutation requires an argument of type `CreateServiceTicketVariables`:
const createServiceTicketVars: CreateServiceTicketVariables = {
  ticketNumber: ..., 
  clientId: ..., 
  serviceTypeId: ..., 
  title: ..., 
  description: ..., 
  deviceName: ..., // optional
  deviceSerialNumber: ..., // optional
  priority: ..., // optional
};

// Call the `createServiceTicket()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createServiceTicket(createServiceTicketVars);
// Variables can be defined inline as well.
const { data } = await createServiceTicket({ ticketNumber: ..., clientId: ..., serviceTypeId: ..., title: ..., description: ..., deviceName: ..., deviceSerialNumber: ..., priority: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createServiceTicket(dataConnect, createServiceTicketVars);

console.log(data.serviceTicket_insert);

// Or, you can use the `Promise` API.
createServiceTicket(createServiceTicketVars).then((response) => {
  const data = response.data;
  console.log(data.serviceTicket_insert);
});
```

### Using `CreateServiceTicket`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createServiceTicketRef, CreateServiceTicketVariables } from '@pcmaker/dataconnect';

// The `CreateServiceTicket` mutation requires an argument of type `CreateServiceTicketVariables`:
const createServiceTicketVars: CreateServiceTicketVariables = {
  ticketNumber: ..., 
  clientId: ..., 
  serviceTypeId: ..., 
  title: ..., 
  description: ..., 
  deviceName: ..., // optional
  deviceSerialNumber: ..., // optional
  priority: ..., // optional
};

// Call the `createServiceTicketRef()` function to get a reference to the mutation.
const ref = createServiceTicketRef(createServiceTicketVars);
// Variables can be defined inline as well.
const ref = createServiceTicketRef({ ticketNumber: ..., clientId: ..., serviceTypeId: ..., title: ..., description: ..., deviceName: ..., deviceSerialNumber: ..., priority: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createServiceTicketRef(dataConnect, createServiceTicketVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.serviceTicket_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.serviceTicket_insert);
});
```

## AddTicketComment
You can execute the `AddTicketComment` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
addTicketComment(vars: AddTicketCommentVariables): MutationPromise<AddTicketCommentData, AddTicketCommentVariables>;

interface AddTicketCommentRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddTicketCommentVariables): MutationRef<AddTicketCommentData, AddTicketCommentVariables>;
}
export const addTicketCommentRef: AddTicketCommentRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
addTicketComment(dc: DataConnect, vars: AddTicketCommentVariables): MutationPromise<AddTicketCommentData, AddTicketCommentVariables>;

interface AddTicketCommentRef {
  ...
  (dc: DataConnect, vars: AddTicketCommentVariables): MutationRef<AddTicketCommentData, AddTicketCommentVariables>;
}
export const addTicketCommentRef: AddTicketCommentRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the addTicketCommentRef:
```typescript
const name = addTicketCommentRef.operationName;
console.log(name);
```

### Variables
The `AddTicketComment` mutation requires an argument of type `AddTicketCommentVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface AddTicketCommentVariables {
  ticketId: UUIDString;
  authorId: UUIDString;
  content: string;
  isInternal?: boolean | null;
}
```
### Return Type
Recall that executing the `AddTicketComment` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `AddTicketCommentData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface AddTicketCommentData {
  ticketComment_insert: TicketComment_Key;
}
```
### Using `AddTicketComment`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, addTicketComment, AddTicketCommentVariables } from '@pcmaker/dataconnect';

// The `AddTicketComment` mutation requires an argument of type `AddTicketCommentVariables`:
const addTicketCommentVars: AddTicketCommentVariables = {
  ticketId: ..., 
  authorId: ..., 
  content: ..., 
  isInternal: ..., // optional
};

// Call the `addTicketComment()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await addTicketComment(addTicketCommentVars);
// Variables can be defined inline as well.
const { data } = await addTicketComment({ ticketId: ..., authorId: ..., content: ..., isInternal: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await addTicketComment(dataConnect, addTicketCommentVars);

console.log(data.ticketComment_insert);

// Or, you can use the `Promise` API.
addTicketComment(addTicketCommentVars).then((response) => {
  const data = response.data;
  console.log(data.ticketComment_insert);
});
```

### Using `AddTicketComment`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, addTicketCommentRef, AddTicketCommentVariables } from '@pcmaker/dataconnect';

// The `AddTicketComment` mutation requires an argument of type `AddTicketCommentVariables`:
const addTicketCommentVars: AddTicketCommentVariables = {
  ticketId: ..., 
  authorId: ..., 
  content: ..., 
  isInternal: ..., // optional
};

// Call the `addTicketCommentRef()` function to get a reference to the mutation.
const ref = addTicketCommentRef(addTicketCommentVars);
// Variables can be defined inline as well.
const ref = addTicketCommentRef({ ticketId: ..., authorId: ..., content: ..., isInternal: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = addTicketCommentRef(dataConnect, addTicketCommentVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.ticketComment_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.ticketComment_insert);
});
```

## CreatePcConfiguration
You can execute the `CreatePcConfiguration` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createPcConfiguration(vars: CreatePcConfigurationVariables): MutationPromise<CreatePcConfigurationData, CreatePcConfigurationVariables>;

interface CreatePcConfigurationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreatePcConfigurationVariables): MutationRef<CreatePcConfigurationData, CreatePcConfigurationVariables>;
}
export const createPcConfigurationRef: CreatePcConfigurationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createPcConfiguration(dc: DataConnect, vars: CreatePcConfigurationVariables): MutationPromise<CreatePcConfigurationData, CreatePcConfigurationVariables>;

interface CreatePcConfigurationRef {
  ...
  (dc: DataConnect, vars: CreatePcConfigurationVariables): MutationRef<CreatePcConfigurationData, CreatePcConfigurationVariables>;
}
export const createPcConfigurationRef: CreatePcConfigurationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createPcConfigurationRef:
```typescript
const name = createPcConfigurationRef.operationName;
console.log(name);
```

### Variables
The `CreatePcConfiguration` mutation requires an argument of type `CreatePcConfigurationVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreatePcConfigurationVariables {
  userId: UUIDString;
  name: string;
  description?: string | null;
  totalPrice?: number | null;
  estimatedPerformance?: number | null;
  isPublic?: boolean | null;
}
```
### Return Type
Recall that executing the `CreatePcConfiguration` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreatePcConfigurationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreatePcConfigurationData {
  pcConfiguration_insert: PcConfiguration_Key;
}
```
### Using `CreatePcConfiguration`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createPcConfiguration, CreatePcConfigurationVariables } from '@pcmaker/dataconnect';

// The `CreatePcConfiguration` mutation requires an argument of type `CreatePcConfigurationVariables`:
const createPcConfigurationVars: CreatePcConfigurationVariables = {
  userId: ..., 
  name: ..., 
  description: ..., // optional
  totalPrice: ..., // optional
  estimatedPerformance: ..., // optional
  isPublic: ..., // optional
};

// Call the `createPcConfiguration()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createPcConfiguration(createPcConfigurationVars);
// Variables can be defined inline as well.
const { data } = await createPcConfiguration({ userId: ..., name: ..., description: ..., totalPrice: ..., estimatedPerformance: ..., isPublic: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createPcConfiguration(dataConnect, createPcConfigurationVars);

console.log(data.pcConfiguration_insert);

// Or, you can use the `Promise` API.
createPcConfiguration(createPcConfigurationVars).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_insert);
});
```

### Using `CreatePcConfiguration`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createPcConfigurationRef, CreatePcConfigurationVariables } from '@pcmaker/dataconnect';

// The `CreatePcConfiguration` mutation requires an argument of type `CreatePcConfigurationVariables`:
const createPcConfigurationVars: CreatePcConfigurationVariables = {
  userId: ..., 
  name: ..., 
  description: ..., // optional
  totalPrice: ..., // optional
  estimatedPerformance: ..., // optional
  isPublic: ..., // optional
};

// Call the `createPcConfigurationRef()` function to get a reference to the mutation.
const ref = createPcConfigurationRef(createPcConfigurationVars);
// Variables can be defined inline as well.
const ref = createPcConfigurationRef({ userId: ..., name: ..., description: ..., totalPrice: ..., estimatedPerformance: ..., isPublic: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createPcConfigurationRef(dataConnect, createPcConfigurationVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.pcConfiguration_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_insert);
});
```

## CreateSavedPcConfiguration
You can execute the `CreateSavedPcConfiguration` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createSavedPcConfiguration(vars: CreateSavedPcConfigurationVariables): MutationPromise<CreateSavedPcConfigurationData, CreateSavedPcConfigurationVariables>;

interface CreateSavedPcConfigurationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateSavedPcConfigurationVariables): MutationRef<CreateSavedPcConfigurationData, CreateSavedPcConfigurationVariables>;
}
export const createSavedPcConfigurationRef: CreateSavedPcConfigurationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createSavedPcConfiguration(dc: DataConnect, vars: CreateSavedPcConfigurationVariables): MutationPromise<CreateSavedPcConfigurationData, CreateSavedPcConfigurationVariables>;

interface CreateSavedPcConfigurationRef {
  ...
  (dc: DataConnect, vars: CreateSavedPcConfigurationVariables): MutationRef<CreateSavedPcConfigurationData, CreateSavedPcConfigurationVariables>;
}
export const createSavedPcConfigurationRef: CreateSavedPcConfigurationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createSavedPcConfigurationRef:
```typescript
const name = createSavedPcConfigurationRef.operationName;
console.log(name);
```

### Variables
The `CreateSavedPcConfiguration` mutation requires an argument of type `CreateSavedPcConfigurationVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateSavedPcConfigurationVariables {
  id: UUIDString;
  userId: UUIDString;
  name: string;
  description?: string | null;
  totalPrice: number;
  savedSnapshot: unknown;
}
```
### Return Type
Recall that executing the `CreateSavedPcConfiguration` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateSavedPcConfigurationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateSavedPcConfigurationData {
  pcConfiguration_insert: PcConfiguration_Key;
}
```
### Using `CreateSavedPcConfiguration`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createSavedPcConfiguration, CreateSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `CreateSavedPcConfiguration` mutation requires an argument of type `CreateSavedPcConfigurationVariables`:
const createSavedPcConfigurationVars: CreateSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
  name: ..., 
  description: ..., // optional
  totalPrice: ..., 
  savedSnapshot: ..., 
};

// Call the `createSavedPcConfiguration()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createSavedPcConfiguration(createSavedPcConfigurationVars);
// Variables can be defined inline as well.
const { data } = await createSavedPcConfiguration({ id: ..., userId: ..., name: ..., description: ..., totalPrice: ..., savedSnapshot: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createSavedPcConfiguration(dataConnect, createSavedPcConfigurationVars);

console.log(data.pcConfiguration_insert);

// Or, you can use the `Promise` API.
createSavedPcConfiguration(createSavedPcConfigurationVars).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_insert);
});
```

### Using `CreateSavedPcConfiguration`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createSavedPcConfigurationRef, CreateSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `CreateSavedPcConfiguration` mutation requires an argument of type `CreateSavedPcConfigurationVariables`:
const createSavedPcConfigurationVars: CreateSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
  name: ..., 
  description: ..., // optional
  totalPrice: ..., 
  savedSnapshot: ..., 
};

// Call the `createSavedPcConfigurationRef()` function to get a reference to the mutation.
const ref = createSavedPcConfigurationRef(createSavedPcConfigurationVars);
// Variables can be defined inline as well.
const ref = createSavedPcConfigurationRef({ id: ..., userId: ..., name: ..., description: ..., totalPrice: ..., savedSnapshot: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createSavedPcConfigurationRef(dataConnect, createSavedPcConfigurationVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.pcConfiguration_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_insert);
});
```

## UpdateSavedPcConfiguration
You can execute the `UpdateSavedPcConfiguration` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateSavedPcConfiguration(vars: UpdateSavedPcConfigurationVariables): MutationPromise<UpdateSavedPcConfigurationData, UpdateSavedPcConfigurationVariables>;

interface UpdateSavedPcConfigurationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateSavedPcConfigurationVariables): MutationRef<UpdateSavedPcConfigurationData, UpdateSavedPcConfigurationVariables>;
}
export const updateSavedPcConfigurationRef: UpdateSavedPcConfigurationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateSavedPcConfiguration(dc: DataConnect, vars: UpdateSavedPcConfigurationVariables): MutationPromise<UpdateSavedPcConfigurationData, UpdateSavedPcConfigurationVariables>;

interface UpdateSavedPcConfigurationRef {
  ...
  (dc: DataConnect, vars: UpdateSavedPcConfigurationVariables): MutationRef<UpdateSavedPcConfigurationData, UpdateSavedPcConfigurationVariables>;
}
export const updateSavedPcConfigurationRef: UpdateSavedPcConfigurationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateSavedPcConfigurationRef:
```typescript
const name = updateSavedPcConfigurationRef.operationName;
console.log(name);
```

### Variables
The `UpdateSavedPcConfiguration` mutation requires an argument of type `UpdateSavedPcConfigurationVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateSavedPcConfigurationVariables {
  id: UUIDString;
  userId: UUIDString;
  name: string;
  description?: string | null;
  totalPrice: number;
  savedSnapshot: unknown;
}
```
### Return Type
Recall that executing the `UpdateSavedPcConfiguration` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateSavedPcConfigurationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateSavedPcConfigurationData {
  pcConfiguration_updateMany: number;
}
```
### Using `UpdateSavedPcConfiguration`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateSavedPcConfiguration, UpdateSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `UpdateSavedPcConfiguration` mutation requires an argument of type `UpdateSavedPcConfigurationVariables`:
const updateSavedPcConfigurationVars: UpdateSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
  name: ..., 
  description: ..., // optional
  totalPrice: ..., 
  savedSnapshot: ..., 
};

// Call the `updateSavedPcConfiguration()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateSavedPcConfiguration(updateSavedPcConfigurationVars);
// Variables can be defined inline as well.
const { data } = await updateSavedPcConfiguration({ id: ..., userId: ..., name: ..., description: ..., totalPrice: ..., savedSnapshot: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateSavedPcConfiguration(dataConnect, updateSavedPcConfigurationVars);

console.log(data.pcConfiguration_updateMany);

// Or, you can use the `Promise` API.
updateSavedPcConfiguration(updateSavedPcConfigurationVars).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_updateMany);
});
```

### Using `UpdateSavedPcConfiguration`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateSavedPcConfigurationRef, UpdateSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `UpdateSavedPcConfiguration` mutation requires an argument of type `UpdateSavedPcConfigurationVariables`:
const updateSavedPcConfigurationVars: UpdateSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
  name: ..., 
  description: ..., // optional
  totalPrice: ..., 
  savedSnapshot: ..., 
};

// Call the `updateSavedPcConfigurationRef()` function to get a reference to the mutation.
const ref = updateSavedPcConfigurationRef(updateSavedPcConfigurationVars);
// Variables can be defined inline as well.
const ref = updateSavedPcConfigurationRef({ id: ..., userId: ..., name: ..., description: ..., totalPrice: ..., savedSnapshot: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateSavedPcConfigurationRef(dataConnect, updateSavedPcConfigurationVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.pcConfiguration_updateMany);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_updateMany);
});
```

## DeleteSavedPcConfiguration
You can execute the `DeleteSavedPcConfiguration` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteSavedPcConfiguration(vars: DeleteSavedPcConfigurationVariables): MutationPromise<DeleteSavedPcConfigurationData, DeleteSavedPcConfigurationVariables>;

interface DeleteSavedPcConfigurationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteSavedPcConfigurationVariables): MutationRef<DeleteSavedPcConfigurationData, DeleteSavedPcConfigurationVariables>;
}
export const deleteSavedPcConfigurationRef: DeleteSavedPcConfigurationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteSavedPcConfiguration(dc: DataConnect, vars: DeleteSavedPcConfigurationVariables): MutationPromise<DeleteSavedPcConfigurationData, DeleteSavedPcConfigurationVariables>;

interface DeleteSavedPcConfigurationRef {
  ...
  (dc: DataConnect, vars: DeleteSavedPcConfigurationVariables): MutationRef<DeleteSavedPcConfigurationData, DeleteSavedPcConfigurationVariables>;
}
export const deleteSavedPcConfigurationRef: DeleteSavedPcConfigurationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteSavedPcConfigurationRef:
```typescript
const name = deleteSavedPcConfigurationRef.operationName;
console.log(name);
```

### Variables
The `DeleteSavedPcConfiguration` mutation requires an argument of type `DeleteSavedPcConfigurationVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteSavedPcConfigurationVariables {
  id: UUIDString;
  userId: UUIDString;
}
```
### Return Type
Recall that executing the `DeleteSavedPcConfiguration` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteSavedPcConfigurationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteSavedPcConfigurationData {
  pcConfiguration_deleteMany: number;
}
```
### Using `DeleteSavedPcConfiguration`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteSavedPcConfiguration, DeleteSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `DeleteSavedPcConfiguration` mutation requires an argument of type `DeleteSavedPcConfigurationVariables`:
const deleteSavedPcConfigurationVars: DeleteSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
};

// Call the `deleteSavedPcConfiguration()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteSavedPcConfiguration(deleteSavedPcConfigurationVars);
// Variables can be defined inline as well.
const { data } = await deleteSavedPcConfiguration({ id: ..., userId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteSavedPcConfiguration(dataConnect, deleteSavedPcConfigurationVars);

console.log(data.pcConfiguration_deleteMany);

// Or, you can use the `Promise` API.
deleteSavedPcConfiguration(deleteSavedPcConfigurationVars).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_deleteMany);
});
```

### Using `DeleteSavedPcConfiguration`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteSavedPcConfigurationRef, DeleteSavedPcConfigurationVariables } from '@pcmaker/dataconnect';

// The `DeleteSavedPcConfiguration` mutation requires an argument of type `DeleteSavedPcConfigurationVariables`:
const deleteSavedPcConfigurationVars: DeleteSavedPcConfigurationVariables = {
  id: ..., 
  userId: ..., 
};

// Call the `deleteSavedPcConfigurationRef()` function to get a reference to the mutation.
const ref = deleteSavedPcConfigurationRef(deleteSavedPcConfigurationVars);
// Variables can be defined inline as well.
const ref = deleteSavedPcConfigurationRef({ id: ..., userId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteSavedPcConfigurationRef(dataConnect, deleteSavedPcConfigurationVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.pcConfiguration_deleteMany);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.pcConfiguration_deleteMany);
});
```

## AddConfigurationComponent
You can execute the `AddConfigurationComponent` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
addConfigurationComponent(vars: AddConfigurationComponentVariables): MutationPromise<AddConfigurationComponentData, AddConfigurationComponentVariables>;

interface AddConfigurationComponentRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddConfigurationComponentVariables): MutationRef<AddConfigurationComponentData, AddConfigurationComponentVariables>;
}
export const addConfigurationComponentRef: AddConfigurationComponentRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
addConfigurationComponent(dc: DataConnect, vars: AddConfigurationComponentVariables): MutationPromise<AddConfigurationComponentData, AddConfigurationComponentVariables>;

interface AddConfigurationComponentRef {
  ...
  (dc: DataConnect, vars: AddConfigurationComponentVariables): MutationRef<AddConfigurationComponentData, AddConfigurationComponentVariables>;
}
export const addConfigurationComponentRef: AddConfigurationComponentRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the addConfigurationComponentRef:
```typescript
const name = addConfigurationComponentRef.operationName;
console.log(name);
```

### Variables
The `AddConfigurationComponent` mutation requires an argument of type `AddConfigurationComponentVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface AddConfigurationComponentVariables {
  configurationId: UUIDString;
  componentId: UUIDString;
  quantity?: number | null;
  priceAtSelection: number;
  isSelected?: boolean | null;
}
```
### Return Type
Recall that executing the `AddConfigurationComponent` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `AddConfigurationComponentData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface AddConfigurationComponentData {
  configurationComponent_insert: ConfigurationComponent_Key;
}
```
### Using `AddConfigurationComponent`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, addConfigurationComponent, AddConfigurationComponentVariables } from '@pcmaker/dataconnect';

// The `AddConfigurationComponent` mutation requires an argument of type `AddConfigurationComponentVariables`:
const addConfigurationComponentVars: AddConfigurationComponentVariables = {
  configurationId: ..., 
  componentId: ..., 
  quantity: ..., // optional
  priceAtSelection: ..., 
  isSelected: ..., // optional
};

// Call the `addConfigurationComponent()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await addConfigurationComponent(addConfigurationComponentVars);
// Variables can be defined inline as well.
const { data } = await addConfigurationComponent({ configurationId: ..., componentId: ..., quantity: ..., priceAtSelection: ..., isSelected: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await addConfigurationComponent(dataConnect, addConfigurationComponentVars);

console.log(data.configurationComponent_insert);

// Or, you can use the `Promise` API.
addConfigurationComponent(addConfigurationComponentVars).then((response) => {
  const data = response.data;
  console.log(data.configurationComponent_insert);
});
```

### Using `AddConfigurationComponent`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, addConfigurationComponentRef, AddConfigurationComponentVariables } from '@pcmaker/dataconnect';

// The `AddConfigurationComponent` mutation requires an argument of type `AddConfigurationComponentVariables`:
const addConfigurationComponentVars: AddConfigurationComponentVariables = {
  configurationId: ..., 
  componentId: ..., 
  quantity: ..., // optional
  priceAtSelection: ..., 
  isSelected: ..., // optional
};

// Call the `addConfigurationComponentRef()` function to get a reference to the mutation.
const ref = addConfigurationComponentRef(addConfigurationComponentVars);
// Variables can be defined inline as well.
const ref = addConfigurationComponentRef({ configurationId: ..., componentId: ..., quantity: ..., priceAtSelection: ..., isSelected: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = addConfigurationComponentRef(dataConnect, addConfigurationComponentVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.configurationComponent_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.configurationComponent_insert);
});
```

## CreateAuthToken
You can execute the `CreateAuthToken` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createAuthToken(vars: CreateAuthTokenVariables): MutationPromise<CreateAuthTokenData, CreateAuthTokenVariables>;

interface CreateAuthTokenRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateAuthTokenVariables): MutationRef<CreateAuthTokenData, CreateAuthTokenVariables>;
}
export const createAuthTokenRef: CreateAuthTokenRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createAuthToken(dc: DataConnect, vars: CreateAuthTokenVariables): MutationPromise<CreateAuthTokenData, CreateAuthTokenVariables>;

interface CreateAuthTokenRef {
  ...
  (dc: DataConnect, vars: CreateAuthTokenVariables): MutationRef<CreateAuthTokenData, CreateAuthTokenVariables>;
}
export const createAuthTokenRef: CreateAuthTokenRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createAuthTokenRef:
```typescript
const name = createAuthTokenRef.operationName;
console.log(name);
```

### Variables
The `CreateAuthToken` mutation requires an argument of type `CreateAuthTokenVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateAuthTokenVariables {
  userId: UUIDString;
  tokenHash: string;
  type: AuthTokenType;
  expiresAt: TimestampString;
}
```
### Return Type
Recall that executing the `CreateAuthToken` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateAuthTokenData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateAuthTokenData {
  authToken_insert: AuthToken_Key;
}
```
### Using `CreateAuthToken`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createAuthToken, CreateAuthTokenVariables } from '@pcmaker/dataconnect';

// The `CreateAuthToken` mutation requires an argument of type `CreateAuthTokenVariables`:
const createAuthTokenVars: CreateAuthTokenVariables = {
  userId: ..., 
  tokenHash: ..., 
  type: ..., 
  expiresAt: ..., 
};

// Call the `createAuthToken()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createAuthToken(createAuthTokenVars);
// Variables can be defined inline as well.
const { data } = await createAuthToken({ userId: ..., tokenHash: ..., type: ..., expiresAt: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createAuthToken(dataConnect, createAuthTokenVars);

console.log(data.authToken_insert);

// Or, you can use the `Promise` API.
createAuthToken(createAuthTokenVars).then((response) => {
  const data = response.data;
  console.log(data.authToken_insert);
});
```

### Using `CreateAuthToken`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createAuthTokenRef, CreateAuthTokenVariables } from '@pcmaker/dataconnect';

// The `CreateAuthToken` mutation requires an argument of type `CreateAuthTokenVariables`:
const createAuthTokenVars: CreateAuthTokenVariables = {
  userId: ..., 
  tokenHash: ..., 
  type: ..., 
  expiresAt: ..., 
};

// Call the `createAuthTokenRef()` function to get a reference to the mutation.
const ref = createAuthTokenRef(createAuthTokenVars);
// Variables can be defined inline as well.
const ref = createAuthTokenRef({ userId: ..., tokenHash: ..., type: ..., expiresAt: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createAuthTokenRef(dataConnect, createAuthTokenVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.authToken_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.authToken_insert);
});
```

## MarkAuthTokenUsed
You can execute the `MarkAuthTokenUsed` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
markAuthTokenUsed(vars: MarkAuthTokenUsedVariables): MutationPromise<MarkAuthTokenUsedData, MarkAuthTokenUsedVariables>;

interface MarkAuthTokenUsedRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: MarkAuthTokenUsedVariables): MutationRef<MarkAuthTokenUsedData, MarkAuthTokenUsedVariables>;
}
export const markAuthTokenUsedRef: MarkAuthTokenUsedRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
markAuthTokenUsed(dc: DataConnect, vars: MarkAuthTokenUsedVariables): MutationPromise<MarkAuthTokenUsedData, MarkAuthTokenUsedVariables>;

interface MarkAuthTokenUsedRef {
  ...
  (dc: DataConnect, vars: MarkAuthTokenUsedVariables): MutationRef<MarkAuthTokenUsedData, MarkAuthTokenUsedVariables>;
}
export const markAuthTokenUsedRef: MarkAuthTokenUsedRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the markAuthTokenUsedRef:
```typescript
const name = markAuthTokenUsedRef.operationName;
console.log(name);
```

### Variables
The `MarkAuthTokenUsed` mutation requires an argument of type `MarkAuthTokenUsedVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface MarkAuthTokenUsedVariables {
  id: UUIDString;
  usedAt: TimestampString;
}
```
### Return Type
Recall that executing the `MarkAuthTokenUsed` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MarkAuthTokenUsedData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface MarkAuthTokenUsedData {
  authToken_update?: AuthToken_Key | null;
}
```
### Using `MarkAuthTokenUsed`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, markAuthTokenUsed, MarkAuthTokenUsedVariables } from '@pcmaker/dataconnect';

// The `MarkAuthTokenUsed` mutation requires an argument of type `MarkAuthTokenUsedVariables`:
const markAuthTokenUsedVars: MarkAuthTokenUsedVariables = {
  id: ..., 
  usedAt: ..., 
};

// Call the `markAuthTokenUsed()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await markAuthTokenUsed(markAuthTokenUsedVars);
// Variables can be defined inline as well.
const { data } = await markAuthTokenUsed({ id: ..., usedAt: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await markAuthTokenUsed(dataConnect, markAuthTokenUsedVars);

console.log(data.authToken_update);

// Or, you can use the `Promise` API.
markAuthTokenUsed(markAuthTokenUsedVars).then((response) => {
  const data = response.data;
  console.log(data.authToken_update);
});
```

### Using `MarkAuthTokenUsed`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, markAuthTokenUsedRef, MarkAuthTokenUsedVariables } from '@pcmaker/dataconnect';

// The `MarkAuthTokenUsed` mutation requires an argument of type `MarkAuthTokenUsedVariables`:
const markAuthTokenUsedVars: MarkAuthTokenUsedVariables = {
  id: ..., 
  usedAt: ..., 
};

// Call the `markAuthTokenUsedRef()` function to get a reference to the mutation.
const ref = markAuthTokenUsedRef(markAuthTokenUsedVars);
// Variables can be defined inline as well.
const ref = markAuthTokenUsedRef({ id: ..., usedAt: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = markAuthTokenUsedRef(dataConnect, markAuthTokenUsedVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.authToken_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.authToken_update);
});
```

## ActivateUser
You can execute the `ActivateUser` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
activateUser(vars: ActivateUserVariables): MutationPromise<ActivateUserData, ActivateUserVariables>;

interface ActivateUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ActivateUserVariables): MutationRef<ActivateUserData, ActivateUserVariables>;
}
export const activateUserRef: ActivateUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
activateUser(dc: DataConnect, vars: ActivateUserVariables): MutationPromise<ActivateUserData, ActivateUserVariables>;

interface ActivateUserRef {
  ...
  (dc: DataConnect, vars: ActivateUserVariables): MutationRef<ActivateUserData, ActivateUserVariables>;
}
export const activateUserRef: ActivateUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the activateUserRef:
```typescript
const name = activateUserRef.operationName;
console.log(name);
```

### Variables
The `ActivateUser` mutation requires an argument of type `ActivateUserVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ActivateUserVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `ActivateUser` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ActivateUserData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ActivateUserData {
  user_update?: User_Key | null;
}
```
### Using `ActivateUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, activateUser, ActivateUserVariables } from '@pcmaker/dataconnect';

// The `ActivateUser` mutation requires an argument of type `ActivateUserVariables`:
const activateUserVars: ActivateUserVariables = {
  id: ..., 
};

// Call the `activateUser()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await activateUser(activateUserVars);
// Variables can be defined inline as well.
const { data } = await activateUser({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await activateUser(dataConnect, activateUserVars);

console.log(data.user_update);

// Or, you can use the `Promise` API.
activateUser(activateUserVars).then((response) => {
  const data = response.data;
  console.log(data.user_update);
});
```

### Using `ActivateUser`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, activateUserRef, ActivateUserVariables } from '@pcmaker/dataconnect';

// The `ActivateUser` mutation requires an argument of type `ActivateUserVariables`:
const activateUserVars: ActivateUserVariables = {
  id: ..., 
};

// Call the `activateUserRef()` function to get a reference to the mutation.
const ref = activateUserRef(activateUserVars);
// Variables can be defined inline as well.
const ref = activateUserRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = activateUserRef(dataConnect, activateUserVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_update);
});
```

## UpdateUserPassword
You can execute the `UpdateUserPassword` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateUserPassword(vars: UpdateUserPasswordVariables): MutationPromise<UpdateUserPasswordData, UpdateUserPasswordVariables>;

interface UpdateUserPasswordRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateUserPasswordVariables): MutationRef<UpdateUserPasswordData, UpdateUserPasswordVariables>;
}
export const updateUserPasswordRef: UpdateUserPasswordRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateUserPassword(dc: DataConnect, vars: UpdateUserPasswordVariables): MutationPromise<UpdateUserPasswordData, UpdateUserPasswordVariables>;

interface UpdateUserPasswordRef {
  ...
  (dc: DataConnect, vars: UpdateUserPasswordVariables): MutationRef<UpdateUserPasswordData, UpdateUserPasswordVariables>;
}
export const updateUserPasswordRef: UpdateUserPasswordRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateUserPasswordRef:
```typescript
const name = updateUserPasswordRef.operationName;
console.log(name);
```

### Variables
The `UpdateUserPassword` mutation requires an argument of type `UpdateUserPasswordVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateUserPasswordVariables {
  id: UUIDString;
  password: string;
}
```
### Return Type
Recall that executing the `UpdateUserPassword` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateUserPasswordData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateUserPasswordData {
  user_update?: User_Key | null;
}
```
### Using `UpdateUserPassword`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateUserPassword, UpdateUserPasswordVariables } from '@pcmaker/dataconnect';

// The `UpdateUserPassword` mutation requires an argument of type `UpdateUserPasswordVariables`:
const updateUserPasswordVars: UpdateUserPasswordVariables = {
  id: ..., 
  password: ..., 
};

// Call the `updateUserPassword()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateUserPassword(updateUserPasswordVars);
// Variables can be defined inline as well.
const { data } = await updateUserPassword({ id: ..., password: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateUserPassword(dataConnect, updateUserPasswordVars);

console.log(data.user_update);

// Or, you can use the `Promise` API.
updateUserPassword(updateUserPasswordVars).then((response) => {
  const data = response.data;
  console.log(data.user_update);
});
```

### Using `UpdateUserPassword`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateUserPasswordRef, UpdateUserPasswordVariables } from '@pcmaker/dataconnect';

// The `UpdateUserPassword` mutation requires an argument of type `UpdateUserPasswordVariables`:
const updateUserPasswordVars: UpdateUserPasswordVariables = {
  id: ..., 
  password: ..., 
};

// Call the `updateUserPasswordRef()` function to get a reference to the mutation.
const ref = updateUserPasswordRef(updateUserPasswordVars);
// Variables can be defined inline as well.
const ref = updateUserPasswordRef({ id: ..., password: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateUserPasswordRef(dataConnect, updateUserPasswordVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_update);
});
```

## DeleteUserByEmail
You can execute the `DeleteUserByEmail` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteUserByEmail(vars: DeleteUserByEmailVariables): MutationPromise<DeleteUserByEmailData, DeleteUserByEmailVariables>;

interface DeleteUserByEmailRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteUserByEmailVariables): MutationRef<DeleteUserByEmailData, DeleteUserByEmailVariables>;
}
export const deleteUserByEmailRef: DeleteUserByEmailRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteUserByEmail(dc: DataConnect, vars: DeleteUserByEmailVariables): MutationPromise<DeleteUserByEmailData, DeleteUserByEmailVariables>;

interface DeleteUserByEmailRef {
  ...
  (dc: DataConnect, vars: DeleteUserByEmailVariables): MutationRef<DeleteUserByEmailData, DeleteUserByEmailVariables>;
}
export const deleteUserByEmailRef: DeleteUserByEmailRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteUserByEmailRef:
```typescript
const name = deleteUserByEmailRef.operationName;
console.log(name);
```

### Variables
The `DeleteUserByEmail` mutation requires an argument of type `DeleteUserByEmailVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteUserByEmailVariables {
  email: string;
}
```
### Return Type
Recall that executing the `DeleteUserByEmail` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteUserByEmailData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteUserByEmailData {
  user_deleteMany: number;
}
```
### Using `DeleteUserByEmail`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteUserByEmail, DeleteUserByEmailVariables } from '@pcmaker/dataconnect';

// The `DeleteUserByEmail` mutation requires an argument of type `DeleteUserByEmailVariables`:
const deleteUserByEmailVars: DeleteUserByEmailVariables = {
  email: ..., 
};

// Call the `deleteUserByEmail()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteUserByEmail(deleteUserByEmailVars);
// Variables can be defined inline as well.
const { data } = await deleteUserByEmail({ email: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteUserByEmail(dataConnect, deleteUserByEmailVars);

console.log(data.user_deleteMany);

// Or, you can use the `Promise` API.
deleteUserByEmail(deleteUserByEmailVars).then((response) => {
  const data = response.data;
  console.log(data.user_deleteMany);
});
```

### Using `DeleteUserByEmail`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteUserByEmailRef, DeleteUserByEmailVariables } from '@pcmaker/dataconnect';

// The `DeleteUserByEmail` mutation requires an argument of type `DeleteUserByEmailVariables`:
const deleteUserByEmailVars: DeleteUserByEmailVariables = {
  email: ..., 
};

// Call the `deleteUserByEmailRef()` function to get a reference to the mutation.
const ref = deleteUserByEmailRef(deleteUserByEmailVars);
// Variables can be defined inline as well.
const ref = deleteUserByEmailRef({ email: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteUserByEmailRef(dataConnect, deleteUserByEmailVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_deleteMany);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_deleteMany);
});
```

## InvalidateUserAuthTokens
You can execute the `InvalidateUserAuthTokens` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
invalidateUserAuthTokens(vars: InvalidateUserAuthTokensVariables): MutationPromise<InvalidateUserAuthTokensData, InvalidateUserAuthTokensVariables>;

interface InvalidateUserAuthTokensRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InvalidateUserAuthTokensVariables): MutationRef<InvalidateUserAuthTokensData, InvalidateUserAuthTokensVariables>;
}
export const invalidateUserAuthTokensRef: InvalidateUserAuthTokensRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
invalidateUserAuthTokens(dc: DataConnect, vars: InvalidateUserAuthTokensVariables): MutationPromise<InvalidateUserAuthTokensData, InvalidateUserAuthTokensVariables>;

interface InvalidateUserAuthTokensRef {
  ...
  (dc: DataConnect, vars: InvalidateUserAuthTokensVariables): MutationRef<InvalidateUserAuthTokensData, InvalidateUserAuthTokensVariables>;
}
export const invalidateUserAuthTokensRef: InvalidateUserAuthTokensRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the invalidateUserAuthTokensRef:
```typescript
const name = invalidateUserAuthTokensRef.operationName;
console.log(name);
```

### Variables
The `InvalidateUserAuthTokens` mutation requires an argument of type `InvalidateUserAuthTokensVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InvalidateUserAuthTokensVariables {
  userId: UUIDString;
  type: AuthTokenType;
}
```
### Return Type
Recall that executing the `InvalidateUserAuthTokens` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InvalidateUserAuthTokensData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InvalidateUserAuthTokensData {
  authToken_updateMany: number;
}
```
### Using `InvalidateUserAuthTokens`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, invalidateUserAuthTokens, InvalidateUserAuthTokensVariables } from '@pcmaker/dataconnect';

// The `InvalidateUserAuthTokens` mutation requires an argument of type `InvalidateUserAuthTokensVariables`:
const invalidateUserAuthTokensVars: InvalidateUserAuthTokensVariables = {
  userId: ..., 
  type: ..., 
};

// Call the `invalidateUserAuthTokens()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await invalidateUserAuthTokens(invalidateUserAuthTokensVars);
// Variables can be defined inline as well.
const { data } = await invalidateUserAuthTokens({ userId: ..., type: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await invalidateUserAuthTokens(dataConnect, invalidateUserAuthTokensVars);

console.log(data.authToken_updateMany);

// Or, you can use the `Promise` API.
invalidateUserAuthTokens(invalidateUserAuthTokensVars).then((response) => {
  const data = response.data;
  console.log(data.authToken_updateMany);
});
```

### Using `InvalidateUserAuthTokens`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, invalidateUserAuthTokensRef, InvalidateUserAuthTokensVariables } from '@pcmaker/dataconnect';

// The `InvalidateUserAuthTokens` mutation requires an argument of type `InvalidateUserAuthTokensVariables`:
const invalidateUserAuthTokensVars: InvalidateUserAuthTokensVariables = {
  userId: ..., 
  type: ..., 
};

// Call the `invalidateUserAuthTokensRef()` function to get a reference to the mutation.
const ref = invalidateUserAuthTokensRef(invalidateUserAuthTokensVars);
// Variables can be defined inline as well.
const ref = invalidateUserAuthTokensRef({ userId: ..., type: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = invalidateUserAuthTokensRef(dataConnect, invalidateUserAuthTokensVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.authToken_updateMany);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.authToken_updateMany);
});
```

