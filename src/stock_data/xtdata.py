"""Direct xtquant.xtdata interface wrappers through xqshare."""

from __future__ import annotations

from typing import Any, Optional

from .utils import compact_kwargs, normalize_stock_code, normalize_stock_list, run_xtdata


def get_market_data(
    field_list: Optional[list[str]] = None,
    stock_list: Optional[list[str]] = None,
    period: str = "1d",
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    dividend_type: str = "none",
    fill_data: bool = True,
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list or [])
    return run_xtdata(
        lambda xtdata: xtdata.get_market_data(
            field_list or [], stocks, period, start_time, end_time, count, dividend_type, fill_data
        ),
        **connection,
    )


def get_market_data_ex(
    field_list: Optional[list[str]] = None,
    stock_list: Optional[list[str]] = None,
    period: str = "1d",
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    dividend_type: str = "none",
    fill_data: bool = True,
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list or [])
    return run_xtdata(
        lambda xtdata: xtdata.get_market_data_ex(
            field_list or [], stocks, period, start_time, end_time, count, dividend_type, fill_data
        ),
        **connection,
    )


def get_local_data(
    field_list: Optional[list[str]] = None,
    stock_list: Optional[list[str]] = None,
    period: str = "1d",
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    dividend_type: str = "none",
    fill_data: bool = True,
    data_dir: Optional[str] = None,
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list or [])
    return run_xtdata(
        lambda xtdata: xtdata.get_local_data(
            field_list or [], stocks, period, start_time, end_time, count, dividend_type, fill_data, data_dir
        ),
        **connection,
    )


def get_full_tick(code_list: list[str], **connection: Any) -> Any:
    codes = normalize_stock_list(code_list)
    return run_xtdata(lambda xtdata: xtdata.get_full_tick(codes), **connection)


def get_l2_quote(
    field_list: Optional[list[str]] = None,
    stock_code: str = "",
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(stock_code) if stock_code else ""
    return run_xtdata(lambda xtdata: xtdata.get_l2_quote(field_list or [], code, start_time, end_time, count), **connection)


def get_l2_order(
    field_list: Optional[list[str]] = None,
    stock_code: str = "",
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(stock_code) if stock_code else ""
    return run_xtdata(lambda xtdata: xtdata.get_l2_order(field_list or [], code, start_time, end_time, count), **connection)


def get_l2_transaction(
    field_list: Optional[list[str]] = None,
    stock_code: str = "",
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(stock_code) if stock_code else ""
    return run_xtdata(lambda xtdata: xtdata.get_l2_transaction(field_list or [], code, start_time, end_time, count), **connection)


def get_l2thousand_queue(
    stock_code: str,
    gear_num: Optional[int] = None,
    price: Any = None,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(stock_code)
    params = compact_kwargs({"gear_num": gear_num, "price": price})
    return run_xtdata(lambda xtdata: xtdata.get_l2thousand_queue(code, **params), **connection)


def get_transactioncount(code_list: list[str], **connection: Any) -> Any:
    codes = normalize_stock_list(code_list)
    return run_xtdata(lambda xtdata: xtdata.get_transactioncount(codes), **connection)


def get_fullspeed_orderbook(code_list: list[str], **connection: Any) -> Any:
    codes = normalize_stock_list(code_list)
    return run_xtdata(lambda xtdata: xtdata.get_fullspeed_orderbook(codes), **connection)


def get_full_kline(
    field_list: Optional[list[str]] = None,
    stock_list: Optional[list[str]] = None,
    period: str = "1m",
    start_time: str = "",
    end_time: str = "",
    count: int = 1,
    dividend_type: str = "none",
    fill_data: bool = True,
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list or [])
    return run_xtdata(
        lambda xtdata: xtdata.get_full_kline(
            field_list or [], stocks, period, start_time, end_time, count, dividend_type, fill_data
        ),
        **connection,
    )


def get_financial_data(
    stock_list: list[str],
    table_list: Optional[list[str]] = None,
    start_time: str = "",
    end_time: str = "",
    report_type: str = "report_time",
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list)
    return run_xtdata(
        lambda xtdata: xtdata.get_financial_data(stocks, table_list or [], start_time, end_time, report_type),
        **connection,
    )


def download_financial_data(
    stock_list: list[str],
    table_list: Optional[list[str]] = None,
    start_time: str = "",
    end_time: str = "",
    incrementally: Optional[bool] = None,
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list)
    params = compact_kwargs({"incrementally": incrementally})
    return run_xtdata(
        lambda xtdata: xtdata.download_financial_data(stocks, table_list or [], start_time, end_time, **params),
        **connection,
    )


def download_financial_data2(
    stock_list: list[str],
    table_list: Optional[list[str]] = None,
    start_time: str = "",
    end_time: str = "",
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list)
    return run_xtdata(lambda xtdata: xtdata.download_financial_data2(stocks, table_list or [], start_time, end_time), **connection)


def get_sector_list(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_sector_list(), **connection)


def get_sector_info(sector_name: str = "", **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_sector_info(sector_name), **connection)


def get_stock_list_in_sector(sector_name: str, real_timetag: int = -1, **connection: Any) -> list[str]:
    return run_xtdata(lambda xtdata: xtdata.get_stock_list_in_sector(sector_name, real_timetag), **connection)


def download_sector_data(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.download_sector_data(), **connection)


def create_sector_folder(parent_node: str, folder_name: str, overwrite: bool = True, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.create_sector_folder(parent_node, folder_name, overwrite), **connection)


def create_sector(parent_node: str, sector_name: str, overwrite: bool = True, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.create_sector(parent_node, sector_name, overwrite), **connection)


def add_sector(sector_name: str, stock_list: list[str], **connection: Any) -> Any:
    stocks = normalize_stock_list(stock_list)
    return run_xtdata(lambda xtdata: xtdata.add_sector(sector_name, stocks), **connection)


def remove_stock_from_sector(sector_name: str, stock_list: list[str], **connection: Any) -> Any:
    stocks = normalize_stock_list(stock_list)
    return run_xtdata(lambda xtdata: xtdata.remove_stock_from_sector(sector_name, stocks), **connection)


def remove_sector(sector_name: str, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.remove_sector(sector_name), **connection)


def reset_sector(sector_name: str, stock_list: list[str], **connection: Any) -> Any:
    stocks = normalize_stock_list(stock_list)
    return run_xtdata(lambda xtdata: xtdata.reset_sector(sector_name, stocks), **connection)


def get_index_weight(index_code: str, **connection: Any) -> Any:
    code = normalize_stock_code(index_code)
    return run_xtdata(lambda xtdata: xtdata.get_index_weight(code), **connection)


def download_index_weight(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.download_index_weight(), **connection)


def get_instrument_detail(stock_code: str, iscomplete: bool = False, **connection: Any) -> Any:
    code = normalize_stock_code(stock_code)
    if iscomplete:
        return run_xtdata(lambda xtdata: xtdata.get_instrument_detail(code, True), **connection)
    return run_xtdata(lambda xtdata: xtdata.get_instrument_detail(code), **connection)


def get_instrument_detail_list(stock_list: list[str], iscomplete: bool = False, **connection: Any) -> Any:
    stocks = normalize_stock_list(stock_list)
    return run_xtdata(lambda xtdata: xtdata.get_instrument_detail_list(stocks, iscomplete), **connection)


def get_instrument_type(
    stock_code: str,
    variety_list: Optional[list[str]] = None,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(stock_code)
    return run_xtdata(lambda xtdata: xtdata.get_instrument_type(code, variety_list), **connection)


def get_markets(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_markets(), **connection)


def get_wp_market_list(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_wp_market_list(), **connection)


def get_period_list(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_period_list(), **connection)


def get_ipo_info(start_time: str = "", end_time: str = "", **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_ipo_info(start_time, end_time), **connection)


def get_trading_dates(
    market: str,
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    **connection: Any,
) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_trading_dates(market, start_time, end_time, count), **connection)


def get_trading_calendar(market: str, start_time: str = "", end_time: str = "", **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_trading_calendar(market, start_time, end_time), **connection)


def get_holidays(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_holidays(), **connection)


def download_holiday_data(incrementally: bool = True, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.download_holiday_data(incrementally), **connection)


def get_divid_factors(stock_code: str, start_time: str = "", end_time: str = "", **connection: Any) -> Any:
    code = normalize_stock_code(stock_code)
    return run_xtdata(lambda xtdata: xtdata.get_divid_factors(code, start_time, end_time), **connection)


def get_option_detail_data(optioncode: str, **connection: Any) -> Any:
    code = normalize_stock_code(optioncode)
    return run_xtdata(lambda xtdata: xtdata.get_option_detail_data(code), **connection)


def get_option_undl_data(undl_code_ref: str, **connection: Any) -> Any:
    code = normalize_stock_code(undl_code_ref)
    return run_xtdata(lambda xtdata: xtdata.get_option_undl_data(code), **connection)


def get_option_list(
    undl_code: str,
    dedate: str,
    opttype: str = "",
    isavailavle: bool = False,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(undl_code)
    return run_xtdata(lambda xtdata: xtdata.get_option_list(code, dedate, opttype, isavailavle), **connection)


def get_his_option_list(undl_code: str, dedate: str, **connection: Any) -> Any:
    code = normalize_stock_code(undl_code)
    return run_xtdata(lambda xtdata: xtdata.get_his_option_list(code, dedate), **connection)


def get_his_option_list_batch(
    undl_code: str,
    start_time: str = "",
    end_time: str = "",
    **connection: Any,
) -> Any:
    code = normalize_stock_code(undl_code)
    return run_xtdata(lambda xtdata: xtdata.get_his_option_list_batch(code, start_time, end_time), **connection)


def download_history_data(
    stock_code: str,
    period: str,
    start_time: str = "",
    end_time: str = "",
    incrementally: Optional[bool] = None,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(stock_code)
    params = compact_kwargs({"incrementally": incrementally})
    return run_xtdata(lambda xtdata: xtdata.download_history_data(code, period, start_time, end_time, **params), **connection)


def download_history_data2(
    stock_list: list[str],
    period: str,
    start_time: str = "",
    end_time: str = "",
    incrementally: Optional[bool] = None,
    **connection: Any,
) -> Any:
    stocks = normalize_stock_list(stock_list)
    params = compact_kwargs({"incrementally": incrementally})
    return run_xtdata(lambda xtdata: xtdata.download_history_data2(stocks, period, start_time, end_time, **params), **connection)


def download_history_contracts(incrementally: bool = True, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.download_history_contracts(incrementally), **connection)


def download_etf_info(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.download_etf_info(), **connection)


def download_cb_data(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.download_cb_data(), **connection)


def download_his_st_data(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.download_his_st_data(), **connection)


def get_main_contract(code_market: str, start_time: str = "", end_time: str = "", **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_main_contract(code_market, start_time, end_time), **connection)


def get_sec_main_contract(code_market: str, start_time: str = "", end_time: str = "", **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_sec_main_contract(code_market, start_time, end_time), **connection)


def get_cb_info(stockcode: str = "", **connection: Any) -> Any:
    code = normalize_stock_code(stockcode) if stockcode else ""
    return run_xtdata(lambda xtdata: xtdata.get_cb_info(code), **connection)


def get_etf_info(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_etf_info(), **connection)


def get_his_st_data(stock_code: str, **connection: Any) -> Any:
    code = normalize_stock_code(stock_code)
    return run_xtdata(lambda xtdata: xtdata.get_his_st_data(code), **connection)


def call_formula(
    formula_name: str,
    stock_code: str,
    period: str,
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    dividend_type: str = "none",
    extend_param: Optional[dict[str, Any]] = None,
    **connection: Any,
) -> Any:
    code = normalize_stock_code(stock_code)
    return run_xtdata(
        lambda xtdata: xtdata.call_formula(
            formula_name, code, period, start_time, end_time, count, dividend_type, extend_param or {}
        ),
        **connection,
    )


def get_formula_result(
    request_id: int,
    start_time: str = "",
    end_time: str = "",
    count: int = -1,
    timeout_second: int = -1,
    **connection: Any,
) -> Any:
    return run_xtdata(
        lambda xtdata: xtdata.get_formula_result(request_id, start_time, end_time, count, timeout_second),
        **connection,
    )


def create_formula(
    formula_name: str,
    formula_content: str,
    formula_params: Optional[dict[str, Any]] = None,
    **connection: Any,
) -> Any:
    return run_xtdata(lambda xtdata: xtdata.create_formula(formula_name, formula_content, formula_params or {}), **connection)


def import_formula(formula_name: str, file_path: str, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.import_formula(formula_name, file_path), **connection)


def del_formula(formula_name: str, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.del_formula(formula_name), **connection)


def get_formulas(**connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.get_formulas(), **connection)


def timetag_to_datetime(timetag: int, format: str, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.timetag_to_datetime(timetag, format), **connection)


def datetime_to_timetag(datetime: str, format: str = "%Y%m%d%H%M%S", **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.datetime_to_timetag(datetime, format), **connection)


def read_feather(file_path: str, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.read_feather(file_path), **connection)


def write_feather(dest_path: str, param: Any, df: Any, **connection: Any) -> Any:
    return run_xtdata(lambda xtdata: xtdata.write_feather(dest_path, param, df), **connection)
