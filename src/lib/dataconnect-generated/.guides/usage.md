# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { createUser, createServiceTicket, addTicketComment, createPcConfiguration, addConfigurationComponent, listComponents, getComponentById, listServiceTypes, listServiceTickets, getServiceTicketById } from '@pcmaker/dataconnect';


// Operation CreateUser:  For variables, look at type CreateUserVars in ../index.d.ts
const { data } = await CreateUser(dataConnect, createUserVars);

// Operation CreateServiceTicket:  For variables, look at type CreateServiceTicketVars in ../index.d.ts
const { data } = await CreateServiceTicket(dataConnect, createServiceTicketVars);

// Operation AddTicketComment:  For variables, look at type AddTicketCommentVars in ../index.d.ts
const { data } = await AddTicketComment(dataConnect, addTicketCommentVars);

// Operation CreatePcConfiguration:  For variables, look at type CreatePcConfigurationVars in ../index.d.ts
const { data } = await CreatePcConfiguration(dataConnect, createPcConfigurationVars);

// Operation AddConfigurationComponent:  For variables, look at type AddConfigurationComponentVars in ../index.d.ts
const { data } = await AddConfigurationComponent(dataConnect, addConfigurationComponentVars);

// Operation ListComponents:  For variables, look at type ListComponentsVars in ../index.d.ts
const { data } = await ListComponents(dataConnect, listComponentsVars);

// Operation GetComponentById:  For variables, look at type GetComponentByIdVars in ../index.d.ts
const { data } = await GetComponentById(dataConnect, getComponentByIdVars);

// Operation ListServiceTypes: 
const { data } = await ListServiceTypes(dataConnect);

// Operation ListServiceTickets: 
const { data } = await ListServiceTickets(dataConnect);

// Operation GetServiceTicketById:  For variables, look at type GetServiceTicketByIdVars in ../index.d.ts
const { data } = await GetServiceTicketById(dataConnect, getServiceTicketByIdVars);


```