import auth from './auth.json';
import common from './common.json';
import main from './main.json';

const messages = {
  auth,
  common,
  main,
} as const;

export default messages;