class OurDate {
	static #monthMap = {
		'jan': 1, 'january': 1,
		'feb': 2, 'february': 2,
		'mar': 3, 'march': 3,
		'apr': 4, 'april': 4,
		'may': 5,
		'jun': 6, 'june': 6,
		'jul': 7, 'july': 7,
		'aug': 8, 'august': 8,
		'sep': 9, 'sept': 9, 'september': 9,
		'oct': 10, 'october': 10,
		'nov': 11, 'november': 11,
		'dec': 12, 'december': 12
	};

	static are_dates_in_asc_order(dt_arr) {
		let dates_are_in_sequence = true;
		for (let i = 1; i < dt_arr.length; i++) {
			dates_are_in_sequence &&= (Temporal.PlainDate.compare(dt_arr[i-1], dt_arr[i]) <= 0);
		}
		return dates_are_in_sequence;
	}

	static get_mth_yr_list(FY) {
		const start_yr = Number(FY.split('-')[0]);
		const months = [3,4,5,6,7,8,9,10,11,12,1,2];
		const mth_yr = months.map(m => {
			let mth = String(m).padStart(2, '0');
			if (m < 3)
				return `${mth}/${start_yr+1}`;
			else
				return `${mth}/${start_yr}`;
		});
		return mth_yr;
	}

	static get_overlap_period(interval_1, interval_2) {
		// intervals are arrays [dt_start, dt_end]
		// where each dt is Date object
		const [dt_start_1, dt_end_1] = interval_1;
		const [dt_start_2, dt_end_2] = interval_2;

		let dt_start = dt_start_1;
		if (Temporal.PlainDate.compare(dt_start_1, dt_start_2) <= 0)
			dt_start = dt_start_2;
		let dt_end = dt_end_2;
		if (Temporal.PlainDate.compare(dt_end_1, dt_end_2) <= 0)
			dt_end = dt_end_1;

		const delta = dt_start.until(dt_end).round({
			smallestUnit: 'day',
			largestUnit: 'month',
			relativeTo: dt_start
		});
		return delta;
	}

	static completed_months_between(dt1, dt2) {
		const delta = dt1.until(dt2).round({
			largestUnit: 'month', relativeTo: dt1
		});
		return delta.months;
	}

	static completed_years_between(dt1, dt2) {
		const delta = dt1.until(dt2).round({
			largestUnit: 'year', relativeTo: dt1
		});
		return delta.years;
	}

	static fin_yr_from_plain_dt(dt) {
		const yr = (dt.month > 3) ? dt.year : (dt.year - 1);
		return `${yr.toString()}-${(yr+1).toString().substring(2)}`;
	}

	static change_format(date_str, from_format, to_format = 'YYYY-MM-DD') {
		let day = '01', month = '01', year = '1900';

		// Validate input
		if (!date_str || typeof date_str !== 'string') {
			console.warn('Invalid date string provided.');
			return '1900-01-01';
		}

		// Handle month-name formats
		if (['DD-MMM-YYYY', 'DD MMM YYYY', 'DD/MMM/YYYY'].includes(from_format)) {
			const separator = from_format[2];
			const parts = date_str.split(separator).map(p => p.trim());

			if (parts.length !== 3) {
				console.warn(`Expected 3 parts in date string for format ${from_format}, got ${parts.length}.`);
				return '1900-01-01';
			}

			day = String(parseInt(parts[0], 10)).padStart(2, '0');
			month = OurDate.#monthMap[parts[1].toLowerCase().trim()] ?? null;
			year = parts[2];

			if (!month) {
				console.warn(`Invalid month abbreviation: ${parts[1]}`);
				return '1900-01-01';
			}
			month = String(month).padStart(2, '0');

			// Basic numeric validation
			if (!/^\d{1,2}$$/.test(day) || !/^\d{4}$$/.test(year)) {
				console.warn('Day or year format is invalid.');
				return '1900-01-01';
			}

		} else {
			console.warn(`Unsupported from_format: ${from_format}`);
			return '1900-01-01';
		}

		// Output formatting
		if (to_format === 'YYYY-MM-DD') {
			return `${year}-${month}-${day}`;
		} else if (to_format === 'DD-MM-YYYY') {
			return `${day}-${month}-${year}`;
		} else {
			console.warn(`Unsupported to_format: ${to_format}`);
			return '1900-01-01';
		}
	}

	static parse_to_temporal(date_str, from_format='') {
		if (from_format === '') {
			if (/^[0-9]{2}-[a-zA-Z]{3}-[0-9]{4}$/.test(date_str))
				from_format = 'DD-MMM-YYYY';
			if (/^[0-9]{2}\/[a-zA-Z]{3}\/[0-9]{4}$/.test(date_str))
				from_format = 'DD/MMM/YYYY';

			if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date_str))
				return Temporal.PlainDate.from(date_str);;
		}

		if (['DD-MMM-YYYY', 'DD MMM YYYY', 'DD/MMM/YYYY'].includes(from_format)) {
			const separator = from_format[2]; // ← Very simple and sufficient

			const parts = date_str.split(separator).map(p => p.trim());

			if (parts.length === 3) {
				const day = Number(parts[0]);
				const year = Number(parts[2]);
				const monthName = parts[1].trim().toLowerCase();
				const month = OurDate.#monthMap[monthName] ?? null;

				if (month) {
					return Temporal.PlainDate.from({ year, month, day });
				}
			}
		}
		// Handle M/DD/YYYY time format
		else if (from_format === 'M/DD/YYYY time') {
			const datePart = date_str.split(' ')[0];
			const parts = datePart.split('/');
			if (parts.length === 3) {
				return Temporal.PlainDate.from({
					year: Number(parts[2]),
					month: Number(parts[0]),
					day: Number(parts[1])
				});
			}
		}

		// Fallback
		return Temporal.PlainDate.from('1900-01-01');
	}

	static formatDate(value, from_format='YYYY-MM-DD') {
		if ( !(value instanceof Date) ) {
			value = new Date(Date.parse(value));
		}

		if (from_format == '{:%Y-%m-%d}')
			from_format='YYYY-MM-DD';

		if (from_format == 'MMM YYYY') {
			return value.toLocaleDateString("en-IN",{year: "numeric", month:"long"});
		}
		if (from_format == 'MM/YYYY') {
			return value.toLocaleDateString("en-IN",{year: "numeric", month:"2-digit"});
		}
		if (from_format == 'DD/MM/YYYY') {
			return value.toLocaleDateString("en-IN",{year: "numeric", month:"2-digit", day:"2-digit"});
		}

		const arr = [
			['YYYY', value.getFullYear()],
			['MM', String(value.getMonth() + 1).padStart(2, '0')],
			['DD', String(value.getDate()).padStart(2, '0')],
		];
		arr.forEach(f => {
			from_format = from_format.replace(f[0], f[1]);
		});
		return from_format;
	}
}

class FinanceFunctions {
	/**
     * Calculate XIRR (irregular cash flows with dates)
     * @param {Array<{amount: number, date: Temporal.PlainDate}>} cashflows
     * @param {number} initialGuess
     * @param {boolean} debug
     * @returns {number}
     */
	static calculateIRR(cashflows, initialGuess = 0.1, debug = false) {
		if (cashflows.length < 2) return NaN;

		// Sort by date
		const sorted = [...cashflows].sort((a, b) =>
										   Temporal.PlainDate.compare(a.date, b.date)
										  );

		const startDate = sorted[0].date;

		// Pre-compute years fraction
		const transactions = sorted.map(cf => {
			const duration = startDate.until(cf.date, {
				largestUnit: 'year',
				smallestUnit: 'day'
			});

			const years = duration.years +
				  (duration.months / 12) +
				  (duration.days / 365.25);   // Better than 31*12

			return { ...cf, years };
		});

		let x = initialGuess;
		const MAX_ITER = 200;
		const EPSILON = 1e-5;
		const MIN_RATE = -0.999;	// Prevent division by zero / negative issues

		for (let i = 0; i < MAX_ITER; i++) {
			let npv = 0;
			let dnpv = 0;
			// Calculate NPV and its derivative for each cash flow and sum them
			for (const tx of transactions) {
				const power = Math.pow(1 + x, tx.years);
				npv += tx.amount / power;
				dnpv += -tx.years * tx.amount / (power * (1 + x));   // derivative
			}

			const xNew = x - npv / dnpv; // new guess

			if (isNaN(xNew) || !isFinite(xNew)) break;

			// Damping to improve convergence
			x = x * 0.3 + xNew * 0.7;

			if (x < MIN_RATE) x = MIN_RATE;

			if (debug) console.log(`Iter ${i}: rate=${x.toFixed(6)}, npv=${npv.toFixed(4)}`);

			// If difference <= the tolerance, we are done
			if (Math.abs(xNew - x) < EPSILON) return x;
		}

		return NaN;   // Did not converge
	}

	// Calculate NPV at a given rate
	static NPV(transactions, rate) {
		//calculate npv of each transaction and sum them up
		if (rate === undefined || !isFinite(rate)) return NaN;

		return transactions.reduce((sum, tx) => {
			const power = Math.pow(1 + rate, tx.years ?? 0);
			return sum + tx.amount / power;
		}, 0);
	}
}

class PreciseMath {
	// JavaScript numbers are IEEE‑754 double‑precision binary
	// floating‑point values. Only fractions that can be expressed
	// as a sum of powers of 2 are represented exactly.
	// Decimal fractions such as 0.1, 0.71, 8.71 cannot be stored
	// precisely, so the internal binary approximation is a
	// little bit smaller or larger. Therefore we multiply by
	// sufficiently large poer of 10 to convert into integer.
	static add(a, b, scale = 3) {
		const mul = Math.pow(10, scale);  // 10ⁿ  (e.g. 1000 for 3 dp)

		// Shift the decimals, then **round** to the nearest integer
		const a1 = Math.round(a * mul);
		const b1 = Math.round(b * mul);

		// Integer subtraction, then shift back
		const result = (a1 + b1) / mul;

		// Force exactly *scale* decimal places for the final string
		return result;//.toFixed(scale);
	}

	static subtract(a, b, scale = 3) {
		const mul = Math.pow(10, scale);  // 10ⁿ  (e.g. 1000 for 3 dp)

		// Shift the decimals, then **round** to the nearest integer
		const a1 = Math.round(a * mul);
		const b1 = Math.round(b * mul);

		// Integer subtraction, then shift back
		const result = (a1 - b1) / mul;

		// Force exactly *scale* decimal places for the final string
		return result;//.toFixed(scale);
	}
}

/**
 * FIFO – First‑In‑First‑Out helper
 *
 * static FIFO.process(inFlows, outFlows, dateKey, unitsKey)
 *
 * Parameters
 * ----------
 * inFlows   : Array<Object> – objects representing incoming items
 * outFlows  : Array<Object> – objects representing outgoing items
 * dateKey   : string        – property name that holds the date (e.g., "date")
 * unitsKey  : string        – property name that holds the quantity (e.g., "units")
 *
 * Returns
 * -------
 * Map<Object|string, Array<Object>>
 *   • Each key is an **original outflow object** (the exact reference from the
 *     `outFlows` array). The associated value is an **array of inflow objects**
 *     that supplied that outflow (each entry contains the same `{date, units}`
 *     shape used throughout the algorithm).
 *   • A special key `'holdings'` maps to an **array of inflow objects** that still
 *     have `remainingUnits > 0` after all possible matches – i.e., inventory that
 *     has not yet been out‑flowed.
 *
 * Behaviour
 * ---------
 * 1  Both arrays are sorted by their `orderKey` (ascending).  
 * 2  Each inflow is matched against outflows in FIFO order, updating:
 *     – `outFlow` on inflows (single object or array of matches)  
 *     – `remainingUnits` on inflows (units left after allocations)  
 *     – `inFlows` on outflows (list of inflow contributions).  
 * 3  While allocating, the method populates the `Map` described above.  
 * 4  After processing, any inflow that still holds units is placed under the
 *    `'holdings'` key in the map.
 *
 * The algorithm works purely in FIFO fashion: the earliest inflow satisfies the
 * earliest outflow until its units are exhausted, then the next inflow is used,
 * and so on.
 */
class FIFO {
	/**
	* Process the two flow arrays.
	*
	* @param {Array<Object>} inFlows   – incoming items
	* @param {Array<Object>} outFlows  – outgoing items
	* @param {string}        dateKey   – key for the date field
	* @param {string}        unitsKey  – key for the units/quantity field
	* @returns a Map{out: Array<Object>, outFlows: Array<Object>}}
	*/
	static process(inFlows, outFlows, orderKey, unitsKey, tolerance=1e-4) {
		const outflowToInflows = new Map();

		// --------------------------------------------------------------------
		// Helper: deep‑clone to avoid mutating caller data unintentionally.
		const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
		const inflows = deepClone(inFlows);
		const outflows = deepClone(outFlows);

		// --------------------------------------------------------------------
		// 1  Sort both arrays by `orderKey`. If the key is missing we fall back
		//    to the provided dateKey (which is usually a timestamp / ISO string).
		const sortByOrder = (a, b) => {
			// if equal, preserve original order
			if (a[orderKey] === b[orderKey]) return 1;
			return a[orderKey] - b[orderKey];
		};
		inflows.sort(sortByOrder);
		outflows.sort(sortByOrder);

		// Initialise bookkeeping fields on the inflow.
		const remainingUnits = `remaining${unitsKey}`;
		const consumedUnits = `consumed${unitsKey}`;

		inflows.forEach(r => {
			r[remainingUnits] = r[unitsKey];
			return r;
		});

		// --------------------------------------------------------------------
		// 2  Walk through the outflows and allocate units from the earliest
		//    inflow(s) that still have stock.
		let inflowIdx = 0; // points to the current inflow we are drawing from

		outflows.forEach(out => {
			// Prepare a container on the outflow to store which inflows fed it.
			const currInFlows = [];

			let unitsNeeded = out[unitsKey];

			// Keep pulling from inflows until we satisfy the outflow or run out.
			while (unitsNeeded > 0 && inflowIdx < inflows.length) {
				const curIn = inflows[inflowIdx];

				// Nothing left in this inflow – move to the next one.
				if (curIn[remainingUnits] <= 0) {
					inflowIdx++;
					continue;
				}

				// Determine how many units we can transfer from this inflow.
				const transfer = Math.min(curIn[remainingUnits], unitsNeeded);

				// Record the transfer on both sides.
				curIn[remainingUnits] = PreciseMath.subtract(curIn[remainingUnits], transfer);

				// Set consumedUnits to indicate no. of units of inflow consumed by this 'out'
				curIn[consumedUnits] = transfer;

				// deep‑clone to avoid mutating caller data unintentionally.
				currInFlows.push(deepClone(curIn));

				unitsNeeded = PreciseMath.subtract(unitsNeeded, transfer);

				// If the current inflow is exhausted, advance the pointer.
				if (curIn[remainingUnits] <= 0) inflowIdx++;
			}

			// If we exit the loop with unitsNeeded > 0, the outflow could not be
			// fully satisfied (not enough inbound stock). We leave the remainder
			// untouched – callers can decide how to handle the shortfall.
			outflowToInflows.set(out, currInFlows.slice()); // store a copy of the inflow list
		});

		// --------------------------------------------------------------------
		// 3  Extract inflows whose remainingUnits > 0
		//    and put them under the 'holdings' key
		const holdings = inflows.filter(r => r[remainingUnits] > tolerance);
		outflowToInflows.set('holdings', holdings);

		// Return the mutated copies.
		return outflowToInflows;
	}
}