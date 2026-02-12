import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';

// PERSISTENT STORAGE
// Note: Use Capacitor Preferences instead of localStorage for larger items
// localStorage is instant and therefore best for initialisation values
// Preferences are async but are guaranteed (OS's can flush localStorage when low on space)

/* LOCAL STORAGE */
export const localGet = (which, defaultVal) => {
  // Make a deep copy of defaultVal so the default itself isn't changed
  defaultVal = defaultVal === undefined ? null 
    : (typeof defaultVal === 'object' && defaultVal !== null) 
      ? JSON.parse(JSON.stringify(defaultVal))
      : defaultVal;
  // Frustratingly, this code runs on the server as well as the client
  // (and on the server localstorage is not available)
  if (!browser || typeof localStorage === 'undefined') {
    return defaultVal;
  }
	var val = localStorage.getItem(which);
	if (val !== undefined && val) {
		try {
			val = JSON.parse(val);
		} catch (e) {
			console.warn('Non-JSON in localStore for', which, ':', val);
			val = defaultVal;
		}
	} else if (defaultVal) {
		localSet(which, defaultVal);
	}
	return val ? val : defaultVal;
};

export const localSet = (key, val) => {
  if (!browser || typeof localStorage === 'undefined') return val;
  localStorage.setItem(key, JSON.stringify(val));
  return val;
};

export const localRemove = (key) => {
  if (!browser || typeof localStorage === 'undefined') return false;
  localStorage.removeItem(key);
};

export const localClear = () => {
  if (!browser || typeof localStorage === 'undefined') return false;
  localStorage.clear();
};

/* CAPACITOR PREFERENCES */
export const prefGet = async (key, defaultVal = null) => {
  if (!browser) return defaultVal;
  const { value } = await Preferences.get({ key });
  if (value === undefined || value === "undefined" || value === null) {
    if (defaultVal !== null) {
      await prefSet(key, defaultVal);
      return defaultVal;
    }
  }
  try {
    return JSON.parse(value);
  } catch (e) {
    console.warn('Non-JSON in Preferences for', key, '... removing:', value);
    if (defaultVal !== null) {
      await prefSet(key, defaultVal);
      return defaultVal;
    }
  }
};

export const prefSet = async (key, val) => {
  if (!browser) return val;
  await Preferences.set({ key, value: JSON.stringify(val) });
  return val;
};

export const prefRemove = async (key) => {
  if (!browser) return false;
  await Preferences.remove({ key });
};


