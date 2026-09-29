import dayjs from "dayjs";
import "dayjs/locale/th";
import buddhistEra from "dayjs/plugin/buddhistEra";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(buddhistEra);
dayjs.extend(utc);
dayjs.extend(timezone);

dayjs.locale("th");

export default dayjs;
