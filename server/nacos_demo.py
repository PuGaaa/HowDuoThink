import asyncio
from getpass import getpass

from v2.nacos import ClientConfigBuilder, ConfigParam, NacosConfigService


async def main() -> None:
    password = getpass("请输入 Nacos 控制台密码：")

    # 通过之前建立的 SSH 隧道，连接服务器上的 Nacos
    client_config = ClientConfigBuilder().server_address("127.0.0.1:8848").username("nacos").password(password).build()

    client = await NacosConfigService.create_config_service(client_config)

    try:
        # 找到我们在网页上创建的那份配置
        content = await client.get_config(
            ConfigParam(
                data_id="demo.python.yaml",
                group="DEFAULT_GROUP",
            )
        )

        if not content:
            raise RuntimeError("没有读到配置内容，请核对配置名称和分组。")

        print("\n读取到的配置：")
        print(content)
    finally:
        # 读取结束后，释放客户端连接
        await client.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
