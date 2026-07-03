import { GCP_SERVICE_ACCOUNT_JSON } from '$env/static/private';

/** @type {object | null} */
let serviceAccount = null;

function loadServiceAccount() {
	if (serviceAccount) return serviceAccount;
	if (!GCP_SERVICE_ACCOUNT_JSON) {
		throw new Error(
			'GCP_SERVICE_ACCOUNT_JSON is not set. Add your Google Cloud service account JSON to .env'
		);
	}
	try {
		serviceAccount = JSON.parse(GCP_SERVICE_ACCOUNT_JSON);
	} catch {
		throw new Error('GCP_SERVICE_ACCOUNT_JSON is not valid JSON');
	}
	return serviceAccount;
}

export function getServiceAccount() {
	return loadServiceAccount();
}
