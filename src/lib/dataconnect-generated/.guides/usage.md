# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { createUser, createServiceTicket, addTicketComment, createPcConfiguration, createSavedPcConfiguration, updateSavedPcConfiguration, deleteSavedPcConfiguration, addConfigurationComponent, createAuthToken, markAuthTokenUsed } from '@pcmaker/dataconnect';


// Operation CreateUser:  For variables, look at type CreateUserVars in ../index.d.ts
const { data } = await CreateUser(dataConnect, createUserVars);

// Operation CreateServiceTicket:  For variables, look at type CreateServiceTicketVars in ../index.d.ts
const { data } = await CreateServiceTicket(dataConnect, createServiceTicketVars);

// Operation AddTicketComment:  For variables, look at type AddTicketCommentVars in ../index.d.ts
const { data } = await AddTicketComment(dataConnect, addTicketCommentVars);

// Operation CreatePcConfiguration:  For variables, look at type CreatePcConfigurationVars in ../index.d.ts
const { data } = await CreatePcConfiguration(dataConnect, createPcConfigurationVars);

// Operation CreateSavedPcConfiguration:  For variables, look at type CreateSavedPcConfigurationVars in ../index.d.ts
const { data } = await CreateSavedPcConfiguration(dataConnect, createSavedPcConfigurationVars);

// Operation UpdateSavedPcConfiguration:  For variables, look at type UpdateSavedPcConfigurationVars in ../index.d.ts
const { data } = await UpdateSavedPcConfiguration(dataConnect, updateSavedPcConfigurationVars);

// Operation DeleteSavedPcConfiguration:  For variables, look at type DeleteSavedPcConfigurationVars in ../index.d.ts
const { data } = await DeleteSavedPcConfiguration(dataConnect, deleteSavedPcConfigurationVars);

// Operation AddConfigurationComponent:  For variables, look at type AddConfigurationComponentVars in ../index.d.ts
const { data } = await AddConfigurationComponent(dataConnect, addConfigurationComponentVars);

// Operation CreateAuthToken:  For variables, look at type CreateAuthTokenVars in ../index.d.ts
const { data } = await CreateAuthToken(dataConnect, createAuthTokenVars);

// Operation MarkAuthTokenUsed:  For variables, look at type MarkAuthTokenUsedVars in ../index.d.ts
const { data } = await MarkAuthTokenUsed(dataConnect, markAuthTokenUsedVars);


```